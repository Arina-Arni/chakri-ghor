import "server-only";
/**
 * The workflow engine (spec Part 3 §3.1) — ours, not a hosted workflow service.
 *
 *  • A run has ordered steps; a step is `(ctx) => Promise<StepResult>`.
 *  • Workers claim the next due step with `SELECT … FOR UPDATE SKIP LOCKED` and hold a 2-minute
 *    lease; a crashed worker's lease expires and the step is reclaimed. Completion only counts if
 *    the worker still owns the lease, so two workers never both finish the same step.
 *  • Completed steps keep their `output`; resuming never re-runs them (later steps read it).
 *  • Per-step retry policy with exponential backoff via `next_attempt_at`; non-retryable errors
 *    fail at once. `next` on success branches (the steps in between are skipped).
 *  • Every state change appends a `workflow_events` row (the timeline).
 * Time is passed in (`now`) so behaviour is deterministic in tests.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db, DbOrTx, Tx } from "@/server/db/client";
import { workflowEvents, workflowRuns, workflowSteps } from "@/server/db/schema";

export const LEASE_MS = 2 * 60_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;

export type StepResult =
  | { kind: "succeeded"; output: unknown; next?: string }
  | { kind: "skipped"; reason: string }
  | { kind: "waiting"; output?: unknown }
  | { kind: "retry"; code: string; message: string; output?: unknown }
  | { kind: "failed"; code: string; message: string; output?: unknown }
  /** End the whole run now (e.g. `duplicate`, or done after a branch). */
  | { kind: "finish"; status: "succeeded" | "duplicate"; output: unknown };

export const succeeded = (output: unknown, next?: string): StepResult => ({ kind: "succeeded", output, next });
export const skipped = (reason: string): StepResult => ({ kind: "skipped", reason });
export const waiting = (output?: unknown): StepResult => ({ kind: "waiting", output });
export const retry = (code: string, message: string, output?: unknown): StepResult => ({ kind: "retry", code, message, output });
export const failed = (code: string, message: string, output?: unknown): StepResult => ({ kind: "failed", code, message, output });
export const finish = (status: "succeeded" | "duplicate", output: unknown): StepResult => ({ kind: "finish", status, output });

export type RunRow = typeof workflowRuns.$inferSelect;
export type StepRow = typeof workflowSteps.$inferSelect;

export type StepContext = {
  db: Db;
  run: RunRow;
  step: StepRow;
  /** Outputs of completed steps, by step name. */
  outputs: Record<string, unknown>;
  now: number;
  /** Persist partial progress (e.g. a batch cursor) so a retry continues from it. */
  progress: (output: unknown) => Promise<void>;
  /** Merge values into the run (context, circular link). */
  updateRun: (patch: { context?: Record<string, unknown>; circularId?: string | null }) => Promise<void>;
};

export type StepDef = { name: string; maxAttempts: number; run: (ctx: StepContext) => Promise<StepResult> };
export type WorkflowDef = { type: string; steps: StepDef[]; onStart?: (ctx: StepContext) => StepResult | null };

export function backoff(attempt: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
}

async function event(db: DbOrTx, runId: string, e: { stepName?: string | null; type: string; fromStatus?: string | null; toStatus?: string | null; message?: string | null; actorId?: string | null }) {
  await db.insert(workflowEvents).values({ runId, stepName: e.stepName ?? null, type: e.type, fromStatus: e.fromStatus ?? null, toStatus: e.toStatus ?? null, message: e.message?.slice(0, 500) ?? null, actorId: e.actorId ?? null });
}
export { event as workflowEvent };

/** Create a run (or return the existing one for the same idempotency key). */
export async function createRun(
  db: Db,
  def: WorkflowDef,
  args: { input: Record<string, unknown>; idempotencyKey: string; createdBy: string | null },
): Promise<{ runId: string; duplicate: boolean }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workflowRuns)
      .values({ type: def.type, status: "queued", input: args.input, idempotencyKey: args.idempotencyKey, createdBy: args.createdBy })
      .onConflictDoNothing({ target: workflowRuns.idempotencyKey })
      .returning({ id: workflowRuns.id });
    if (!row) {
      const [existing] = await tx.select({ id: workflowRuns.id }).from(workflowRuns).where(eq(workflowRuns.idempotencyKey, args.idempotencyKey));
      return { runId: existing.id, duplicate: true };
    }
    await tx.insert(workflowSteps).values(def.steps.map((s, i) => ({ runId: row.id, name: s.name, position: i, maxAttempts: s.maxAttempts })));
    await event(tx, row.id, { type: "run.created", toStatus: "queued", actorId: args.createdBy });
    return { runId: row.id, duplicate: false };
  });
}

/**
 * Claim the next due step (optionally of one run). The step must be pending and due, or
 * running with an expired lease; every earlier step must be done.
 */
export async function claimNext(db: Db, workerId: string, now: number, runId?: string): Promise<StepRow | null> {
  const nowTs = new Date(now).toISOString();
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      select s.id from ${workflowSteps} s
      join ${workflowRuns} r on r.id = s.run_id
      where r.status in ('queued', 'running')
        ${runId ? sql`and r.id = ${runId}` : sql``}
        and (
          (s.status = 'pending' and (s.next_attempt_at is null or s.next_attempt_at <= ${nowTs}::timestamptz))
          or (s.status = 'running' and s.lease_until < ${nowTs}::timestamptz)
        )
        and not exists (
          select 1 from ${workflowSteps} p
          where p.run_id = s.run_id and p.position < s.position and p.status not in ('succeeded', 'skipped')
        )
      order by s.next_attempt_at nulls first, s.created_at
      limit 1
      for update of s skip locked`);
    const list = (Array.isArray(rows) ? rows : (rows as { rows: { id: string }[] }).rows) as { id: string }[];
    if (list.length === 0) return null;
    const id = list[0].id;
    const [before] = await tx.select().from(workflowSteps).where(eq(workflowSteps.id, id));
    const reclaimed = before.status === "running";
    const [step] = await tx
      .update(workflowSteps)
      .set({
        status: "running",
        leaseOwner: workerId,
        leaseUntil: new Date(now + LEASE_MS),
        attempts: sql`${workflowSteps.attempts} + 1`,
        startedAt: new Date(now),
        finishedAt: null,
        updatedAt: new Date(now),
      })
      .where(eq(workflowSteps.id, id))
      .returning();
    await tx
      .update(workflowRuns)
      .set({ status: "running", startedAt: sql`coalesce(${workflowRuns.startedAt}, ${nowTs}::timestamptz)`, updatedAt: new Date(now) })
      .where(eq(workflowRuns.id, step.runId));
    await event(tx, step.runId, { stepName: step.name, type: reclaimed ? "step.reclaimed" : "step.started", fromStatus: before.status, toStatus: "running", message: reclaimed ? `lease of ${before.leaseOwner} expired` : null });
    return step;
  });
}

async function loadOutputs(db: DbOrTx, runId: string): Promise<Record<string, unknown>> {
  const steps = await db.select({ name: workflowSteps.name, status: workflowSteps.status, output: workflowSteps.output }).from(workflowSteps).where(eq(workflowSteps.runId, runId));
  return Object.fromEntries(steps.filter((s) => s.status === "succeeded" || s.output != null).map((s) => [s.name, s.output]));
}

/** Run one claimed step and record its result (only if this worker still holds the lease). */
export async function executeStep(db: Db, def: WorkflowDef, step: StepRow, workerId: string, now: number): Promise<StepResult | null> {
  const stepDef = def.steps.find((s) => s.name === step.name);
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, step.runId));
  if (!stepDef || !run) return null;
  const ctx: StepContext = {
    db,
    run,
    step,
    outputs: await loadOutputs(db, run.id),
    now,
    progress: async (output) => {
      await db.update(workflowSteps).set({ output, updatedAt: new Date() }).where(and(eq(workflowSteps.id, step.id), eq(workflowSteps.leaseOwner, workerId)));
    },
    updateRun: async (patch) => {
      await db
        .update(workflowRuns)
        .set({
          ...(patch.context ? { context: sql`${workflowRuns.context} || ${JSON.stringify(patch.context)}::jsonb` } : {}),
          ...(patch.circularId !== undefined ? { circularId: patch.circularId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, run.id));
    },
  };
  let result: StepResult;
  try {
    result = def.onStart?.(ctx) ?? (await stepDef.run(ctx));
  } catch (e) {
    result = retry("EXCEPTION", (e as Error)?.message ?? String(e));
  }
  const applied = await completeStep(db, def, step, workerId, result, now);
  return applied ? result : null;
}

/** Apply a step result. Returns false when the lease was lost (another worker owns it). */
export async function completeStep(db: Db, def: WorkflowDef, step: StepRow, workerId: string, result: StepResult, now: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(workflowSteps).where(eq(workflowSteps.id, step.id)).for("update");
    if (!cur || cur.status !== "running" || cur.leaseOwner !== workerId) return false;
    const done = { leaseOwner: null, leaseUntil: null, finishedAt: new Date(now), updatedAt: new Date(now) };
    const runId = step.runId;
    const ev = (type: string, toStatus: string, message?: string | null) => event(tx, runId, { stepName: step.name, type, fromStatus: "running", toStatus, message });

    const setRun = (status: RunRow["status"], extra: Partial<typeof workflowRuns.$inferInsert> = {}) =>
      tx.update(workflowRuns).set({ status, updatedAt: new Date(now), ...extra }).where(eq(workflowRuns.id, runId));
    const skipRest = async (from: number, until?: number) => {
      const all = await tx.select().from(workflowSteps).where(eq(workflowSteps.runId, runId)).orderBy(asc(workflowSteps.position));
      for (const s of all) {
        if (s.position > from && (until == null || s.position < until) && (s.status === "pending" || s.status === "waiting")) {
          await tx.update(workflowSteps).set({ status: "skipped", output: { skippedReason: "branch" }, updatedAt: new Date(now) }).where(eq(workflowSteps.id, s.id));
          await event(tx, runId, { stepName: s.name, type: "step.skipped", fromStatus: s.status, toStatus: "skipped", message: "branch not taken" });
        }
      }
    };
    const maybeFinished = async () => {
      const [{ open }] = (await tx
        .select({ open: sql<number>`count(*) filter (where ${workflowSteps.status} not in ('succeeded','skipped'))::int` })
        .from(workflowSteps)
        .where(eq(workflowSteps.runId, runId))) as { open: number }[];
      if (Number(open) === 0) {
        await setRun("succeeded", { finishedAt: new Date(now), error: null });
        await event(tx, runId, { type: "run.succeeded", toStatus: "succeeded" });
      }
    };

    switch (result.kind) {
      case "succeeded": {
        await tx.update(workflowSteps).set({ status: "succeeded", output: result.output ?? null, errorCode: null, errorMessage: null, ...done }).where(eq(workflowSteps.id, step.id));
        await ev("step.succeeded", "succeeded");
        const nextName = result.next;
        if (nextName) {
          const target = def.steps.findIndex((s) => s.name === nextName);
          await skipRest(step.position, target < 0 ? undefined : target);
        }
        await maybeFinished();
        return true;
      }
      case "skipped": {
        await tx.update(workflowSteps).set({ status: "skipped", output: { skippedReason: result.reason }, ...done }).where(eq(workflowSteps.id, step.id));
        await ev("step.skipped", "skipped", result.reason);
        await maybeFinished();
        return true;
      }
      case "waiting": {
        await tx.update(workflowSteps).set({ status: "waiting", output: result.output ?? null, leaseOwner: null, leaseUntil: null, updatedAt: new Date(now) }).where(eq(workflowSteps.id, step.id));
        await setRun("waiting_review");
        await ev("step.waiting", "waiting");
        return true;
      }
      case "retry": {
        if (cur.attempts < cur.maxAttempts) {
          await tx
            .update(workflowSteps)
            .set({ status: "pending", errorCode: result.code, errorMessage: result.message, nextAttemptAt: new Date(now + backoff(cur.attempts)), ...(result.output !== undefined ? { output: result.output } : {}), leaseOwner: null, leaseUntil: null, updatedAt: new Date(now) })
            .where(eq(workflowSteps.id, step.id));
          await ev("step.retry_scheduled", "pending", `${result.code}: ${result.message}`);
          return true;
        }
        // Out of attempts → fail like a non-retryable error.
        result = { kind: "failed", code: result.code, message: result.message, output: result.output };
      }
      // falls through
      case "failed": {
        const r = result as Extract<StepResult, { kind: "failed" }>;
        await tx
          .update(workflowSteps)
          .set({ status: "failed", errorCode: r.code, errorMessage: r.message, ...(r.output !== undefined ? { output: r.output } : {}), ...done })
          .where(eq(workflowSteps.id, step.id));
        await setRun("failed", { finishedAt: new Date(now), error: `${step.name}: ${r.code}` });
        await ev("step.failed", "failed", `${r.code}: ${r.message}`);
        await event(tx, runId, { type: "run.failed", toStatus: "failed", message: step.name });
        return true;
      }
      case "finish": {
        await tx.update(workflowSteps).set({ status: "succeeded", output: result.output ?? null, ...done }).where(eq(workflowSteps.id, step.id));
        await ev("step.succeeded", "succeeded");
        await skipRest(step.position);
        await setRun(result.status, { finishedAt: new Date(now), error: null });
        await event(tx, runId, { type: `run.${result.status}`, toStatus: result.status });
        return true;
      }
    }
  });
}

/** Claim and run up to `limit` steps. Returns how many were processed. */
export async function tick(db: Db, defs: Record<string, WorkflowDef>, opts: { workerId: string; now?: () => number; limit?: number; runId?: string }): Promise<number> {
  const now = opts.now ?? (() => Date.now());
  let n = 0;
  for (; n < (opts.limit ?? 20); n++) {
    const step = await claimNext(db, opts.workerId, now(), opts.runId);
    if (!step) break;
    const [run] = await db.select({ type: workflowRuns.type }).from(workflowRuns).where(eq(workflowRuns.id, step.runId));
    const def = defs[run?.type ?? ""];
    if (!def) break;
    await executeStep(db, def, step, opts.workerId, now());
  }
  return n;
}

export type { Tx };
