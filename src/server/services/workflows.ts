import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { extractionSchema } from "@/domain/ingest";
import { integrationEnv } from "@/env";
import { t } from "@/i18n";
import { WORKFLOW_STEPS, type WorkflowAction, type WorkflowRun, type WorkflowStepCode } from "@/types";
import { createRun, tick, workflowEvent } from "@/lib/workflow/engine";
import { authorize, requireUser } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import type { Ctx } from "@/server/context";
import { getDb, type Db, type DbOrTx, type Tx } from "@/server/db/client";
import { circulars, workflowRuns, workflowSteps } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { blobs } from "@/server/workflow/blobs";
import { SKIPPABLE_STEPS, WORKFLOWS, ingestWorkflow, type IngestInput } from "@/server/workflow/ingest";

type RunRow = typeof workflowRuns.$inferSelect;
type StepRow = typeof workflowSteps.$inferSelect;

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toRun(r: RunRow, steps: StepRow[], slug: string | null): WorkflowRun {
  const input = r.input as unknown as IngestInput;
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const current = ordered.find((s) => s.status !== "succeeded" && s.status !== "skipped");
  const end = r.finishedAt ?? (r.status === "running" || r.status === "queued" ? null : r.updatedAt);
  return {
    id: r.id,
    source: { kind: input.kind, label: input.label },
    status: r.status,
    currentStep: (current?.name as WorkflowStepCode | undefined) ?? null,
    circularId: r.circularId,
    circularSlug: slug,
    startedAt: (r.startedAt ?? r.createdAt).toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    durationMs: end ? end.getTime() - (r.startedAt ?? r.createdAt).getTime() : null,
    steps: ordered.map((s) => ({
      id: s.id,
      runId: s.runId,
      code: s.name as WorkflowStepCode,
      labelBn: t(`enums.workflowStep.${s.name as WorkflowStepCode}`),
      status: s.status,
      attempts: s.attempts,
      maxAttempts: s.maxAttempts,
      startedAt: s.startedAt?.toISOString() ?? null,
      finishedAt: s.finishedAt?.toISOString() ?? null,
      durationMs: s.startedAt && s.finishedAt ? s.finishedAt.getTime() - s.startedAt.getTime() : null,
      error: s.errorCode ? { code: s.errorCode, messageBn: s.errorMessage ?? "" } : null,
      input: s.input,
      output: s.output,
      skippable: SKIPPABLE_STEPS.includes(s.name),
    })),
  };
}

async function hydrate(db: DbOrTx, runs: RunRow[]): Promise<WorkflowRun[]> {
  if (runs.length === 0) return [];
  const ids = runs.map((r) => r.id);
  const [steps, slugs] = await Promise.all([
    db.select().from(workflowSteps).where(inArray(workflowSteps.runId, ids)),
    db.select({ id: circulars.id, slug: circulars.slug }).from(circulars).where(inArray(circulars.id, runs.map((r) => r.circularId).filter((x): x is string => Boolean(x)).concat(["00000000-0000-0000-0000-000000000000"]))),
  ]);
  const slugBy = new Map(slugs.map((s) => [s.id, s.slug]));
  return runs.map((r) => toRun(r, steps.filter((s) => s.runId === r.id), r.circularId ? (slugBy.get(r.circularId) ?? null) : null));
}

export async function listWorkflowRuns(ctx: Ctx, db: DbOrTx, f: { status?: string }): Promise<WorkflowRun[]> {
  authorize(ctx.actor, "circular.moderate");
  const runs = await db
    .select()
    .from(workflowRuns)
    .where(f.status ? eq(workflowRuns.status, f.status as RunRow["status"]) : undefined)
    .orderBy(desc(workflowRuns.createdAt))
    .limit(100);
  return hydrate(db, runs);
}

export async function getWorkflowRun(ctx: Ctx, db: DbOrTx, id: string): Promise<WorkflowRun> {
  authorize(ctx.actor, "circular.moderate");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("NOT_FOUND");
  const [r] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id));
  if (!r) throw new AppError("NOT_FOUND");
  return (await hydrate(db, [r]))[0];
}

/** Process due steps (worker, `after()`, and the admin "Run now"). */
export async function runWorker(db: Db = getDb(), opts: { runId?: string; limit?: number; now?: () => number; workerId?: string } = {}): Promise<number> {
  return tick(db, WORKFLOWS, { workerId: opts.workerId ?? `w-${crypto.randomUUID().slice(0, 8)}`, limit: opts.limit ?? 30, runId: opts.runId, now: opts.now });
}

export type IngestRequest =
  | { kind: "pdf_upload"; fileName: string; bytes: Uint8Array; failAt?: string | null }
  | { kind: "pdf_url"; url: string; bytes: Uint8Array; failAt?: string | null }
  | { kind: "text"; text: string; failAt?: string | null };

/**
 * Start an ingestion run. The idempotency key is `ingest:{sha256}`, so the same PDF (or text)
 * again returns the existing run as DUPLICATE without new work.
 */
export async function startIngest(ctx: Ctx, db: Db, req: IngestRequest, opts: { faultInjectionAllowed?: boolean } = {}): Promise<{ runId: string; duplicate: boolean }> {
  const userId = requireUser(ctx.actor, "circular.moderate", { mutation: true });
  const isAdmin = ctx.actor.kind === "user" && ctx.actor.role === "admin";
  const allowed = opts.faultInjectionAllowed ?? integrationEnv().FAULT_INJECTION_ALLOWED;
  if (req.failAt && (!isAdmin || !allowed)) throw new AppError("FORBIDDEN", { message_bn: "ইচ্ছাকৃত ব্যর্থতা শুধু অ্যাডমিন, এবং শুধু অনুমোদিত সার্ভারে।" });
  if (req.failAt && !(WORKFLOW_STEPS as readonly string[]).includes(req.failAt)) throw new AppError("VALIDATION", { fields: { failAt: "অচেনা ধাপ" } });

  let input: IngestInput;
  if (req.kind === "text") {
    const text = req.text.trim();
    if (text.length < 50) throw new AppError("VALIDATION", { fields: { text: t("validation.tooShort", { n: 50 }) } });
    input = { kind: "text", label: `পেস্ট করা লেখা (${text.length} অক্ষর)`, sha256: sha256(text), size: text.length, text, failAt: req.failAt ?? null };
  } else {
    const b = req.bytes;
    if (b.length > 15 * 1024 * 1024) throw new AppError("FILE_TOO_LARGE");
    if (!(b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)) throw new AppError("FILE_TYPE");
    const sha = sha256(b);
    const blobPath = `ingest/${sha}.pdf`;
    await blobs().put(blobPath, b, "application/pdf");
    input = { kind: req.kind, label: req.kind === "pdf_upload" ? req.fileName.slice(0, 120) : req.url.slice(0, 200), sha256: sha, size: b.length, blobPath, failAt: req.failAt ?? null };
  }
  // A failAt demo run gets its own key so the normal upload of the same file still works.
  const key = `ingest:${input.sha256}${input.failAt ? `:fail:${input.failAt}:${Date.now()}` : ""}`;
  const r = await createRun(db, ingestWorkflow, { input: input as unknown as Record<string, unknown>, idempotencyKey: key, createdBy: userId });
  if (!r.duplicate) {
    await db.transaction((tx) => writeAudit(tx, ctx, { action: "workflow.start", entityType: "workflow_run", entityId: r.runId, after: { source: input.label, failAt: input.failAt ?? null } }));
  }
  return r;
}

async function stepsOf(tx: DbOrTx, runId: string) {
  return tx.select().from(workflowSteps).where(eq(workflowSteps.runId, runId)).orderBy(asc(workflowSteps.position));
}

/** Retry / resume from / skip / cancel / edit-and-continue (staff, audit-logged). */
export async function workflowAction(
  ctx: Ctx,
  tx: Tx,
  runId: string,
  action: WorkflowAction,
  payload: { step?: WorkflowStepCode; reason?: string; json?: string },
): Promise<WorkflowRun> {
  const actorId = requireUser(ctx.actor, "circular.moderate", { mutation: true });
  const [run] = await tx.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).for("update");
  if (!run) throw new AppError("NOT_FOUND");
  const steps = await stepsOf(tx, runId);
  const now = new Date(ctx.now());
  const ev = (type: string, stepName: string | null, message?: string) => workflowEvent(tx, runId, { type, stepName, message, actorId });
  const reopen = (patch: Partial<typeof workflowRuns.$inferInsert> = {}) =>
    tx.update(workflowRuns).set({ status: "running", finishedAt: null, error: null, updatedAt: now, ...patch }).where(eq(workflowRuns.id, runId));
  const reset = (ids: string[]) =>
    ids.length
      ? tx.update(workflowSteps).set({ status: "pending", attempts: 0, nextAttemptAt: null, errorCode: null, errorMessage: null, leaseOwner: null, leaseUntil: null, finishedAt: null, updatedAt: now }).where(inArray(workflowSteps.id, ids))
      : Promise.resolve();

  switch (action) {
    case "retry_step": {
      const failed = steps.find((s) => s.status === "failed");
      if (!failed || run.status !== "failed") throw new AppError("ILLEGAL_TRANSITION", { message_bn: "পুনরায় চেষ্টার মতো ব্যর্থ ধাপ নেই।" });
      // Keep a batch cursor (notify_matches) so the retry continues from it.
      await tx.update(workflowSteps).set({ status: "pending", attempts: 0, nextAttemptAt: null, errorCode: null, errorMessage: null, leaseOwner: null, leaseUntil: null, finishedAt: null, updatedAt: now }).where(eq(workflowSteps.id, failed.id));
      await reopen({ context: sql`${workflowRuns.context} || '{"faultCleared": true}'::jsonb` as unknown as Record<string, unknown> });
      await ev("action.retry_step", failed.name);
      break;
    }
    case "run_from_step": {
      const from = steps.find((s) => s.name === payload.step);
      if (!from || run.status === "running" || run.status === "queued") throw new AppError("ILLEGAL_TRANSITION", { message_bn: "চলমান রানে এটি করা যায় না।" });
      if (steps.some((s) => s.position < from.position && s.status !== "succeeded" && s.status !== "skipped")) {
        throw new AppError("ILLEGAL_TRANSITION", { message_bn: "আগের সব ধাপ শেষ হলে তবেই এখান থেকে চালানো যায়।" });
      }
      await reset(steps.filter((s) => s.position >= from.position && !(s.status === "skipped" && (s.output as { skippedReason?: string } | null)?.skippedReason === "branch")).map((s) => s.id));
      await reopen({ context: sql`${workflowRuns.context} || '{"faultCleared": true}'::jsonb` as unknown as Record<string, unknown> });
      await ev("action.run_from_step", from.name);
      break;
    }
    case "skip_step": {
      const step = steps.find((s) => s.name === payload.step);
      if (!step || !SKIPPABLE_STEPS.includes(step.name)) throw new AppError("VALIDATION", { message_bn: "শুধু ট্যাগিং ও নোটিফিকেশন ধাপ এড়ানো যায়।" });
      if (!payload.reason || payload.reason.trim().length < 5) throw new AppError("VALIDATION", { fields: { reason: t("validation.reasonRequired") } });
      if (step.status !== "pending" && step.status !== "failed") throw new AppError("ILLEGAL_TRANSITION");
      await tx.update(workflowSteps).set({ status: "skipped", output: { skippedReason: payload.reason.trim() }, leaseOwner: null, leaseUntil: null, updatedAt: now }).where(eq(workflowSteps.id, step.id));
      if (run.status === "failed") await reopen();
      await ev("action.skip_step", step.name, payload.reason.trim());
      // A skipped last step may complete the run.
      const rest = (await stepsOf(tx, runId)).filter((s) => s.status !== "succeeded" && s.status !== "skipped");
      if (rest.length === 0) await tx.update(workflowRuns).set({ status: "succeeded", finishedAt: now, updatedAt: now }).where(eq(workflowRuns.id, runId));
      break;
    }
    case "cancel_run": {
      if (!["running", "queued", "waiting_review", "failed"].includes(run.status)) throw new AppError("ILLEGAL_TRANSITION");
      await tx.update(workflowSteps).set({ status: "skipped", output: { skippedReason: "cancelled" }, leaseOwner: null, leaseUntil: null, updatedAt: now }).where(and(eq(workflowSteps.runId, runId), inArray(workflowSteps.status, ["pending", "running", "waiting", "failed"])));
      await tx.update(workflowRuns).set({ status: "cancelled", finishedAt: now, updatedAt: now }).where(eq(workflowRuns.id, runId));
      // Compensation: a draft created by this run is soft-deleted (a published circular never is).
      if (run.circularId && steps.find((s) => s.name === "create_draft")?.status === "succeeded") {
        await tx
          .update(circulars)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(eq(circulars.id, run.circularId), inArray(circulars.status, ["draft", "pending_review"])));
      }
      await ev("action.cancel_run", null);
      break;
    }
    case "fix_and_run": {
      const norm = steps.find((s) => s.name === "normalize_validate");
      const extract = steps.find((s) => s.name === "ai_extract");
      if (!norm || !extract || norm.status !== "failed") throw new AppError("ILLEGAL_TRANSITION", { message_bn: "শুধু যাচাই ধাপ ব্যর্থ হলে তথ্য ঠিক করা যায়।" });
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload.json ?? "");
      } catch {
        throw new AppError("VALIDATION", { fields: { json: t("admin.workflow.fixInvalid") } });
      }
      const ex = extractionSchema.safeParse((parsed as { extraction?: unknown })?.extraction ?? parsed);
      if (!ex.success) throw new AppError("VALIDATION", { fields: { json: ex.error.issues.slice(0, 2).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      await tx.update(workflowSteps).set({ output: { method: "manual", extraction: ex.data, editedBy: actorId }, updatedAt: now }).where(eq(workflowSteps.id, extract.id));
      await reset([norm.id]);
      await reopen();
      await ev("action.fix_and_run", norm.name);
      break;
    }
  }
  await writeAudit(tx, ctx, { action: `workflow.${action}`, entityType: "workflow_run", entityId: runId, after: { step: payload.step ?? null, reason: payload.reason ?? null } });
  const [fresh] = await tx.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  return (await hydrate(tx, [fresh]))[0];
}

/**
 * A moderator decided in /admin/review: resume the run waiting at review_gate (event
 * circular.approved) or close it (circular.rejected).
 */
export async function resumeAfterReview(tx: Tx, circularId: string, decision: "approved" | "rejected", actorId: string | null, now: number): Promise<string | null> {
  const [run] = await tx.select().from(workflowRuns).where(and(eq(workflowRuns.circularId, circularId), eq(workflowRuns.status, "waiting_review")));
  if (!run) return null;
  const steps = await stepsOf(tx, run.id);
  const gate = steps.find((s) => s.name === "review_gate");
  if (!gate || gate.status !== "waiting") return null;
  await tx.update(workflowSteps).set({ status: "succeeded", output: { decision, by: actorId }, finishedAt: new Date(now), updatedAt: new Date(now) }).where(eq(workflowSteps.id, gate.id));
  if (decision === "approved") {
    await tx.update(workflowRuns).set({ status: "running", updatedAt: new Date(now) }).where(eq(workflowRuns.id, run.id));
  } else {
    await tx.update(workflowSteps).set({ status: "skipped", output: { skippedReason: "rejected in review" }, updatedAt: new Date(now) }).where(and(eq(workflowSteps.runId, run.id), eq(workflowSteps.status, "pending")));
    await tx.update(workflowRuns).set({ status: "cancelled", finishedAt: new Date(now), updatedAt: new Date(now) }).where(eq(workflowRuns.id, run.id));
  }
  await workflowEvent(tx, run.id, { type: `circular.${decision}`, stepName: "review_gate", actorId, toStatus: decision === "approved" ? "running" : "cancelled" });
  return run.id;
}

/** Workflow backlog for /api/health. */
export async function workflowBacklog(db: DbOrTx): Promise<{ due: number; running: number; waitingReview: number; failed: number }> {
  const [r] = await db
    .select({
      due: sql<number>`count(*) filter (where ${workflowRuns.status} in ('queued','running'))::int`,
      waitingReview: sql<number>`count(*) filter (where ${workflowRuns.status} = 'waiting_review')::int`,
      failed: sql<number>`count(*) filter (where ${workflowRuns.status} = 'failed')::int`,
    })
    .from(workflowRuns);
  const [s] = await db.select({ running: sql<number>`count(*)::int` }).from(workflowSteps).where(eq(workflowSteps.status, "running"));
  return { due: Number(r.due), running: Number(s.running), waitingReview: Number(r.waitingReview), failed: Number(r.failed) };
}
