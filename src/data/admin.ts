// TEMP — replaced by the real implementation in Part 2 (and the workflow engine in Part 3)
import { dhakaDateKey } from "@/domain/bn";
import { CIRCULAR_TRANSITIONS } from "@/domain/status";
import { t } from "@/i18n";
import type {
  AdminCircularRow,
  AdminSettings,
  AdminUser,
  AiFeature,
  AiHealthStats,
  AuditLogEntry,
  Circular,
  CircularAction,
  CircularRevision,
  CircularStatus,
  DashboardStats,
  FaultMode,
  FeatureFlags,
  IngestInput,
  Organization,
  Result,
  ReviewQueueItem,
  Role,
  WorkflowAction,
  WorkflowRun,
  WorkflowStepCode,
} from "@/types";
import { fail, mutate, nowIso, ok, read, requestId, uid } from "./_runtime";
import { getRole } from "./session";
import { buildAiHealth, buildRevisions, makeSteps, STEP_ORDER } from "./fixtures/admin";
import { getDb } from "./fixtures/db";
import { categoryById, divisionById } from "./fixtures/taxonomy";

const H = 3_600_000;
const DAY = 24 * H;
const STEP_MS = 2500;

function staffOnly<T>(): Result<T> | null {
  const r = getRole();
  return r === "moderator" || r === "admin" ? null : fail(r === "guest" ? "UNAUTHENTICATED" : "FORBIDDEN");
}
function adminOnly<T>(): Result<T> | null {
  return getRole() === "admin" ? null : fail("FORBIDDEN");
}

function audit(action: string, entityType: AuditLogEntry["entityType"], entityId: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const role = getRole();
  getDb().audit.unshift({
    id: uid("aud"),
    at: nowIso(),
    actor: { id: `usr_${role}`, name: role === "admin" ? "নুসরাত জাহান" : "তানভীর হাসান", role: role as Role },
    action,
    entityType,
    entityId,
    before,
    after,
    requestId: requestId(),
  });
}

// ───────── dashboard ─────────

export async function getAdminDashboard(): Promise<Result<DashboardStats>> {
  return read(() => {
    const g = staffOnly<DashboardStats>();
    if (g) return g;
    const db = getDb();
    const now = Date.now();
    const pub = db.circulars.filter((c) => c.status === "published");
    const open = pub.filter((c) => new Date(c.endAt).getTime() > now);
    const today = dhakaDateKey(now);
    const byCat = new Map<string, number>();
    const byDiv = new Map<string, number>();
    for (const c of open) {
      byCat.set(c.categoryId, (byCat.get(c.categoryId) ?? 0) + 1);
      const div = c.divisionId ?? "all";
      byDiv.set(div, (byDiv.get(div) ?? 0) + 1);
    }
    const days = Array.from({ length: 7 }, (_, i) => dhakaDateKey(now - (6 - i) * DAY));
    return ok({
      openCirculars: open.length,
      openVacancies: open.reduce((n, c) => n + c.totalVacancies, 0),
      closingToday: open.filter((c) => dhakaDateKey(c.endAt) === today).length,
      publishedToday: pub.filter((c) => c.publishedAt && dhakaDateKey(c.publishedAt) === today).length + 2,
      reviewPending: db.reviewQueue.length,
      byCategory: [...byCat.entries()].map(([id, count]) => ({ labelBn: categoryById.get(id)?.nameBn ?? id, count })).sort((a, b) => b.count - a.count),
      byDivision: [...byDiv.entries()].map(([id, count]) => ({ labelBn: id === "all" ? "সারা দেশ" : (divisionById.get(id)?.nameBn ?? id), count })).sort((a, b) => b.count - a.count),
      workflowRuns7d: days.map((date, i) => ({ date, succeeded: [6, 9, 7, 11, 8, 12, 5][i], failed: [1, 0, 2, 1, 0, 1, 1][i], waiting: [0, 1, 0, 0, 2, 1, 1][i] })),
      aiOutcomes: [
        { labelBn: "AI সফল", count: 2049 },
        { labelBn: "ফলব্যাক", count: 137 },
      ],
      signupsPerDay: days.map((date, i) => ({ date, count: [42, 55, 48, 71, 66, 90, 58][i] })),
      topSearches: [
        { query: "সরকারি চাকরি খুলনা", count: 412 },
        { query: "এইচএসসি পাসে চাকরি", count: 388 },
        { query: "ব্যাংক জব", count: 301 },
        { query: "প্রাথমিক শিক্ষক", count: 276 },
        { query: "রিমোট ইন্টার্নশিপ", count: 120 },
      ],
      zeroResultSearches: [
        { query: "পাইলট চাকরি সিলেট", count: 18 },
        { query: "ওয়েব ডিজাইনার রাজশাহী", count: 11 },
        { query: "হোটেল ম্যানেজমেন্ট", count: 7 },
      ],
    });
  });
}

// ───────── circulars ─────────

function sourceOf(c: Circular): AdminCircularRow["source"] {
  const run = getDb().runs.find((r) => r.circularId === c.id);
  return run ? run.source.kind : "manual";
}

export function toAdminRow(c: Circular): AdminCircularRow {
  return {
    id: c.id,
    slug: c.slug,
    titleBn: c.titleBn,
    organizationNameBn: c.organization.nameBn,
    status: c.status,
    endAt: c.endAt,
    postCount: c.posts.length,
    source: sourceOf(c),
    updatedAt: c.updatedAt,
    version: c.version,
  };
}

export async function listAdminCirculars(filters: { q?: string; status?: CircularStatus | "all" }): Promise<Result<AdminCircularRow[]>> {
  return read(
    () => {
      const g = staffOnly<AdminCircularRow[]>();
      if (g) return g;
      const q = filters.q?.trim().toLowerCase();
      return ok(
        getDb()
          .circulars.filter((c) => !filters.status || filters.status === "all" || c.status === filters.status)
          .filter((c) => !q || `${c.titleBn} ${c.titleEn} ${c.organization.nameBn}`.toLowerCase().includes(q))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(toAdminRow),
      );
    },
    { empty: () => [] },
  );
}

export async function getAdminCircular(id: string): Promise<Result<Circular>> {
  return read(() => {
    const g = staffOnly<Circular>();
    if (g) return g;
    const c = getDb().circulars.find((x) => x.id === id);
    return c ? ok(structuredClone(c)) : fail<Circular>("NOT_FOUND");
  });
}

export type CircularDraft = Omit<
  Circular,
  "id" | "slug" | "organization" | "status" | "totalVacancies" | "publishedAt" | "createdAt" | "updatedAt" | "version" | "originalEndAt" | "noticePdfUrl" | "aiTags" | "howToApplyBn"
> & { organizationId: string };

export async function saveCircular(
  data: CircularDraft & { id?: string | null },
  version: number | null,
  idempotencyKey: string,
  intent: "draft" | "submit" | "publish" = "draft",
): Promise<Result<Circular>> {
  return mutate(
    idempotencyKey,
    () => {
      const g = staffOnly<Circular>();
      if (g) return g;
      const db = getDb();
      const org = db.organizations.find((o) => o.id === data.organizationId);
      if (!org) return fail<Circular>("VALIDATION", { fields: { organizationId: t("validation.required") } });
      const status: CircularStatus = intent === "publish" ? (getRole() === "admin" ? "published" : "in_review") : intent === "submit" ? "in_review" : "draft";
      const existing = data.id ? db.circulars.find((c) => c.id === data.id) : null;
      if (existing && version !== existing.version) return fail<Circular>("CONFLICT");
      const id = existing?.id ?? uid("cir");
      const at = nowIso();
      const next: Circular = {
        ...(existing ?? {
          originalEndAt: null,
          noticePdfUrl: null,
          aiTags: [],
          howToApplyBn: [],
          createdAt: at,
          version: 0,
          publishedAt: null,
        }),
        ...data,
        id,
        slug: existing?.slug ?? `${(data.titleEn || "circular").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${id.slice(-4)}`,
        organization: { id: org.id, slug: org.slug, nameBn: org.nameBn, nameEn: org.nameEn, shortName: org.shortName, verified: org.verified, type: org.type },
        posts: data.posts.map((p, i) => ({ ...p, id: p.id || `${id}_p${i + 1}`, circularId: id })),
        status,
        totalVacancies: data.posts.reduce((n, p) => n + p.vacancies, 0),
        publishedAt: status === "published" ? (existing?.publishedAt ?? at) : (existing?.publishedAt ?? null),
        updatedAt: at,
        version: (existing?.version ?? 0) + 1,
      } as Circular;
      if (existing) Object.assign(existing, next);
      else db.circulars.unshift(next);
      audit(existing ? "circular.update" : "circular.create", "circular", id, existing ? { status: existing.status } : null, { status });
      return ok(structuredClone(next));
    },
    { versioned: true },
  );
}

export async function transitionCircular(
  id: string,
  action: CircularAction,
  payload: { reason?: string; newEndAt?: string },
  version: number,
  idempotencyKey: string,
): Promise<Result<AdminCircularRow>> {
  return mutate(
    idempotencyKey,
    () => {
      const g = staffOnly<AdminCircularRow>();
      if (g) return g;
      const c = getDb().circulars.find((x) => x.id === id);
      if (!c) return fail<AdminCircularRow>("NOT_FOUND");
      if (c.version !== version) return fail<AdminCircularRow>("CONFLICT");
      const rule = CIRCULAR_TRANSITIONS[action];
      if (!rule.from.includes(c.status)) return fail<AdminCircularRow>("ILLEGAL_TRANSITION");
      if (action === "approve" && getRole() !== "admin" && getRole() !== "moderator") return fail<AdminCircularRow>("FORBIDDEN");
      const before = { status: c.status, endAt: c.endAt };
      if (action === "extend") {
        if (!payload.newEndAt || payload.newEndAt <= c.endAt) return fail<AdminCircularRow>("VALIDATION", { fields: { newEnd: t("validation.newDateLater") } });
        c.originalEndAt = c.originalEndAt ?? c.endAt;
        c.endAt = payload.newEndAt;
      }
      if (rule.to) c.status = rule.to;
      if (action === "approve") c.publishedAt = nowIso();
      c.version += 1;
      c.updatedAt = nowIso();
      audit(`circular.${action}`, "circular", id, before, { status: c.status, endAt: c.endAt, ...(payload.reason ? { reason: payload.reason } : {}) });
      return ok(toAdminRow(c));
    },
    { versioned: true },
  );
}

export async function getCircularRevisions(id: string): Promise<Result<CircularRevision[]>> {
  return read(() => {
    const db = getDb();
    const entries = db.audit.filter((a) => a.entityType === "circular" && a.entityId === id && a.after);
    const live: CircularRevision[] = entries.map((a) => ({
      id: a.id,
      at: a.at,
      actorName: a.actor.name,
      changes: Object.keys(a.after ?? {}).map((k) => ({ field: k, before: String(a.before?.[k] ?? "—"), after: String(a.after?.[k] ?? "—") })),
    }));
    return ok([...live, ...buildRevisions(db.createdAt)]);
  }, { empty: () => [] });
}

// ───────── review queue ─────────

export async function listReviewQueue(): Promise<Result<ReviewQueueItem[]>> {
  return read(() => staffOnly<ReviewQueueItem[]>() ?? ok(structuredClone(getDb().reviewQueue)), { empty: () => [] });
}

export async function getReviewItem(id: string): Promise<Result<ReviewQueueItem>> {
  return read(() => {
    const g = staffOnly<ReviewQueueItem>();
    if (g) return g;
    const item = getDb().reviewQueue.find((r) => r.id === id);
    return item ? ok(structuredClone(item)) : fail<ReviewQueueItem>("NOT_FOUND");
  });
}

export async function decideReview(
  id: string,
  decision: "approve" | "reject",
  payload: { reason?: string; fields?: Record<string, string> },
  idempotencyKey: string,
): Promise<Result<{ circularId: string }>> {
  return mutate(idempotencyKey, () => {
    const g = staffOnly<{ circularId: string }>();
    if (g) return g;
    const db = getDb();
    const item = db.reviewQueue.find((r) => r.id === id);
    if (!item) return fail<{ circularId: string }>("NOT_FOUND");
    if (decision === "reject" && !payload.reason?.trim()) return fail<{ circularId: string }>("VALIDATION", { fields: { reason: t("validation.reasonRequired") } });
    db.reviewQueue = db.reviewQueue.filter((r) => r.id !== id);
    const c = db.circulars.find((x) => x.id === item.circularId);
    if (c) {
      c.status = decision === "approve" ? "published" : "rejected";
      if (decision === "approve") c.publishedAt = nowIso();
      c.version += 1;
    }
    const run = db.runs.find((r) => r.id === item.runId);
    if (run) {
      const now = Date.now();
      for (const s of run.steps) {
        if (s.code === "review_gate") Object.assign(s, { status: "succeeded", finishedAt: nowIso(), output: { decision, ...payload.fields } });
        else if (s.status === "pending") Object.assign(s, decision === "approve" ? { status: "succeeded", attempts: 1, startedAt: nowIso(), finishedAt: nowIso(), durationMs: 600 } : { status: "skipped" });
      }
      run.status = decision === "approve" ? "succeeded" : "cancelled";
      run.currentStep = null;
      run.finishedAt = nowIso();
      run.durationMs = now - new Date(run.startedAt).getTime();
    }
    audit(`circular.review_${decision}`, "circular", item.circularId, { status: "in_review" }, { status: decision === "approve" ? "published" : "rejected", ...(payload.reason ? { reason: payload.reason } : {}) });
    return ok({ circularId: item.circularId });
  });
}

// ───────── ingest & workflow ─────────

type Sim = { startMs: number; fromIndex: number; failAt: WorkflowStepCode | null };
const sims = new Map<string, Sim>();

function ensureSeedSims() {
  const db = getDb();
  const running = db.runs.find((r) => r.id === "run_1045");
  if (running && running.status === "running" && !sims.has(running.id)) {
    sims.set(running.id, { startMs: Date.now(), fromIndex: 2, failAt: null });
  }
}

/** Move a simulated run forward according to elapsed time. */
function advance(run: WorkflowRun) {
  const sim = sims.get(run.id);
  if (!sim || run.status !== "running") return;
  const now = Date.now();
  const db = getDb();
  const reached = sim.fromIndex + Math.floor((now - sim.startMs) / STEP_MS);
  for (let i = sim.fromIndex; i < STEP_ORDER.length; i++) {
    const step = run.steps[i];
    if (step.status === "skipped") continue;
    const stepStart = sim.startMs + (i - sim.fromIndex) * STEP_MS;
    if (i < reached) {
      if (sim.failAt === step.code) {
        Object.assign(step, {
          status: "failed",
          attempts: 3,
          startedAt: new Date(stepStart).toISOString(),
          finishedAt: new Date(stepStart + STEP_MS).toISOString(),
          durationMs: STEP_MS,
          error: { code: "INJECTED_FAILURE", messageBn: "পরীক্ষার জন্য ইচ্ছাকৃত ব্যর্থতা (fault injection)" },
        });
        run.status = "failed";
        run.currentStep = step.code;
        run.finishedAt = step.finishedAt;
        run.durationMs = new Date(step.finishedAt!).getTime() - new Date(run.startedAt).getTime();
        sims.delete(run.id);
        return;
      }
      if (step.code === "review_gate" && !db.adminSettings.flags.autoPublish) {
        Object.assign(step, { status: "waiting", attempts: 1, startedAt: new Date(stepStart).toISOString(), input: { confidence: 0.74 } });
        run.status = "waiting_review";
        run.currentStep = "review_gate";
        if (run.circularId && !db.reviewQueue.some((r) => r.runId === run.id)) {
          db.reviewQueue.unshift({
            id: uid("rq"),
            circularId: run.circularId,
            runId: run.id,
            titleBn: db.circulars.find((c) => c.id === run.circularId)?.titleBn ?? run.source.label,
            source: t(`enums.ingestSource.${run.source.kind}`),
            confidence: 0.74,
            waitingSince: nowIso(),
            pdfUrl: run.source.kind === "text" ? null : "/sample-notice.pdf",
            fields: [
              { key: "titleBn", labelBn: "পদের নাম", value: "নমুনা পদ", confidence: 0.82 },
              { key: "vacancies", labelBn: "পদের সংখ্যা", value: "১০", confidence: 0.64 },
            ],
          });
        }
        sims.delete(run.id);
        return;
      }
      Object.assign(step, {
        status: "succeeded",
        attempts: Math.max(1, step.attempts),
        startedAt: new Date(stepStart).toISOString(),
        finishedAt: new Date(stepStart + STEP_MS).toISOString(),
        durationMs: STEP_MS,
        error: null,
        input: step.input ?? { runId: run.id },
        output: step.output ?? { ok: true },
      });
      if (step.code === "ai_extract" && !run.circularId) {
        // Create a draft circular from the "extracted" data.
        const c = structuredClone(db.circulars.find((x) => x.slug === "review-bbs-enumerator")!);
        c.id = uid("cir");
        c.slug = `ingested-${c.id.slice(-6)}`;
        c.titleBn = `${run.source.label} — নতুন সার্কুলার`;
        c.status = "in_review";
        db.circulars.unshift(c);
        run.circularId = c.id;
        run.circularSlug = c.slug;
      }
    } else if (i === reached) {
      Object.assign(step, { status: "running", attempts: Math.max(1, step.attempts), startedAt: new Date(stepStart).toISOString() });
      run.currentStep = step.code;
      return;
    }
  }
  if (reached >= STEP_ORDER.length) {
    run.status = "succeeded";
    run.currentStep = null;
    run.finishedAt = nowIso();
    run.durationMs = now - new Date(run.startedAt).getTime();
    sims.delete(run.id);
  }
}

export async function ingest(input: IngestInput, idempotencyKey: string): Promise<Result<{ runId: string }>> {
  return mutate(idempotencyKey, () => {
    const g = staffOnly<{ runId: string }>();
    if (g) return g;
    const db = getDb();
    const label = input.kind === "pdf_upload" ? input.file.name : input.kind === "pdf_url" ? input.url : `পেস্ট করা লেখা (${input.text.length} অক্ষর)`;
    if (input.kind !== "text") {
      const dup = db.runs.find((r) => r.source.label === label && r.status !== "failed" && r.status !== "cancelled");
      if (dup) return fail<{ runId: string }>("DUPLICATE", { message_bn: t("admin.ingest.duplicate"), fields: { runId: dup.id } });
    }
    if (input.kind === "pdf_url" && !/(\.gov\.bd|teletalk\.com\.bd)(\/|$)/.test(new URL(input.url).hostname + "/")) {
      return fail<{ runId: string }>("VALIDATION", { fields: { url: t("admin.ingest.urlHint") } });
    }
    const id = `run_${1046 + db.runs.length}`;
    const start = Date.now();
    db.runs.unshift({
      id,
      source: { kind: input.kind, label },
      status: "running",
      currentStep: "fetch_source",
      circularId: null,
      circularSlug: null,
      startedAt: new Date(start).toISOString(),
      finishedAt: null,
      durationMs: null,
      steps: makeSteps(id, start, []),
    });
    sims.set(id, { startMs: start, fromIndex: 0, failAt: input.failAtStep ?? null });
    audit("workflow.start", "workflow_run", id, null, { source: label });
    return ok({ runId: id });
  });
}

export async function listWorkflowRuns(filter: { status?: string } = {}): Promise<Result<WorkflowRun[]>> {
  return read(
    () => {
      const g = staffOnly<WorkflowRun[]>();
      if (g) return g;
      ensureSeedSims();
      const runs = getDb().runs;
      runs.forEach(advance);
      return ok(structuredClone(filter.status ? runs.filter((r) => r.status === filter.status) : runs));
    },
    { empty: () => [] },
  );
}

export async function getWorkflowRun(id: string): Promise<Result<WorkflowRun>> {
  return read(() => {
    const g = staffOnly<WorkflowRun>();
    if (g) return g;
    ensureSeedSims();
    const run = getDb().runs.find((r) => r.id === id);
    if (!run) return fail<WorkflowRun>("NOT_FOUND");
    advance(run);
    return ok(structuredClone(run));
  });
}

export async function workflowAction(
  runId: string,
  action: WorkflowAction,
  payload: { step?: WorkflowStepCode; reason?: string; json?: string },
  idempotencyKey: string,
): Promise<Result<WorkflowRun>> {
  return mutate(idempotencyKey, () => {
    const g = staffOnly<WorkflowRun>();
    if (g) return g;
    const run = getDb().runs.find((r) => r.id === runId);
    if (!run) return fail<WorkflowRun>("NOT_FOUND");
    const idxOf = (code?: WorkflowStepCode) => (code ? STEP_ORDER.indexOf(code) : -1);
    const restartFrom = (index: number) => {
      for (let i = index; i < run.steps.length; i++) {
        if (run.steps[i].status !== "skipped" || i === index) Object.assign(run.steps[i], { status: "pending", error: null, finishedAt: null, durationMs: null });
      }
      run.status = "running";
      run.finishedAt = null;
      run.durationMs = null;
      sims.set(run.id, { startMs: Date.now(), fromIndex: index, failAt: null });
      advance(run);
    };
    switch (action) {
      case "retry_step": {
        const failed = run.steps.findIndex((s) => s.status === "failed");
        if (failed < 0) return fail<WorkflowRun>("ILLEGAL_TRANSITION");
        run.steps[failed].attempts = 0;
        restartFrom(failed);
        break;
      }
      case "run_from_step": {
        const i = idxOf(payload.step);
        if (i < 0 || run.status === "running") return fail<WorkflowRun>("ILLEGAL_TRANSITION");
        restartFrom(i);
        break;
      }
      case "skip_step": {
        const i = idxOf(payload.step);
        const step = run.steps[i];
        if (!step || !step.skippable || !payload.reason?.trim()) return fail<WorkflowRun>("VALIDATION", { fields: { reason: t("validation.reasonRequired") } });
        Object.assign(step, { status: "skipped", output: { skippedReason: payload.reason } });
        if (run.status === "failed") restartFrom(i + 1);
        break;
      }
      case "cancel_run": {
        if (!["running", "waiting_review", "queued"].includes(run.status)) return fail<WorkflowRun>("ILLEGAL_TRANSITION");
        for (const s of run.steps) if (["pending", "running", "waiting"].includes(s.status)) s.status = "skipped";
        run.status = "cancelled";
        run.finishedAt = nowIso();
        sims.delete(run.id);
        break;
      }
      case "fix_and_run": {
        const failed = run.steps.findIndex((s) => s.status === "failed");
        if (failed < 0) return fail<WorkflowRun>("ILLEGAL_TRANSITION");
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload.json ?? "");
        } catch {
          return fail<WorkflowRun>("VALIDATION", { fields: { json: t("admin.workflow.fixInvalid") } });
        }
        Object.assign(run.steps[failed], { status: "succeeded", output: parsed, error: null, finishedAt: nowIso(), durationMs: 0 });
        restartFrom(failed + 1);
        break;
      }
    }
    audit(`workflow.${action}`, "workflow_run", runId, null, { step: payload.step ?? null, reason: payload.reason ?? null });
    return ok(structuredClone(run));
  });
}

// ───────── organizations ─────────

export async function listOrganizations(): Promise<Result<Organization[]>> {
  return read(() => ok(structuredClone(getDb().organizations)), { empty: () => [] });
}

export async function saveOrganization(
  data: Pick<Organization, "nameBn" | "nameEn" | "shortName" | "type" | "website">,
  id: string | null,
  version: number | null,
  idempotencyKey: string,
): Promise<Result<Organization>> {
  return mutate(
    idempotencyKey,
    () => {
      const g = staffOnly<Organization>();
      if (g) return g;
      const db = getDb();
      if (id) {
        const o = db.organizations.find((x) => x.id === id);
        if (!o) return fail<Organization>("NOT_FOUND");
        if (o.version !== version) return fail<Organization>("CONFLICT");
        Object.assign(o, data, { version: o.version + 1, updatedAt: nowIso() });
        audit("organization.update", "organization", id, null, { ...data });
        return ok({ ...o });
      }
      const o: Organization = {
        ...data,
        id: uid("org"),
        slug: data.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        verified: false,
        openCircularCount: 0,
        totalCircularCount: 0,
        version: 1,
        updatedAt: nowIso(),
      };
      db.organizations.unshift(o);
      audit("organization.create", "organization", o.id, null, { ...data });
      return ok({ ...o });
    },
    { versioned: true },
  );
}

export async function setOrganizationVerified(id: string, verified: boolean, idempotencyKey: string): Promise<Result<Organization>> {
  return mutate(idempotencyKey, () => {
    const o = getDb().organizations.find((x) => x.id === id);
    if (!o) return fail<Organization>("NOT_FOUND");
    audit("organization.verify", "organization", id, { verified: o.verified }, { verified });
    o.verified = verified;
    o.version += 1;
    return ok({ ...o });
  });
}

// ───────── users & audit (admin only) ─────────

export async function listUsers(filter: { q?: string; role?: string } = {}): Promise<Result<AdminUser[]>> {
  return read(
    () => {
      const g = adminOnly<AdminUser[]>();
      if (g) return g;
      const q = filter.q?.trim().toLowerCase();
      return ok(
        getDb().users.filter(
          (u) => (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)) && (!filter.role || filter.role === "all" || u.role === filter.role),
        ),
      );
    },
    { empty: () => [] },
  );
}

export async function changeUserRole(userId: string, role: AdminUser["role"], adminPassword: string, idempotencyKey: string): Promise<Result<AdminUser>> {
  return mutate(idempotencyKey, () => {
    const g = adminOnly<AdminUser>();
    if (g) return g;
    if (adminPassword.length < 8) return fail<AdminUser>("UNAUTHENTICATED", { message_bn: "পাসওয়ার্ড ঠিক নেই", fields: { adminPassword: "পাসওয়ার্ড ঠিক নেই" } });
    const u = getDb().users.find((x) => x.id === userId);
    if (!u) return fail<AdminUser>("NOT_FOUND");
    audit("user.role_change", "user", userId, { role: u.role }, { role });
    u.role = role;
    return ok({ ...u });
  });
}

export async function setUserStatus(userId: string, status: AdminUser["status"], idempotencyKey: string): Promise<Result<AdminUser>> {
  return mutate(idempotencyKey, () => {
    const g = adminOnly<AdminUser>();
    if (g) return g;
    const u = getDb().users.find((x) => x.id === userId);
    if (!u) return fail<AdminUser>("NOT_FOUND");
    audit(status === "suspended" ? "user.suspend" : "user.unsuspend", "user", userId, { status: u.status }, { status });
    u.status = status;
    return ok({ ...u });
  });
}

export async function listAuditLogs(filter: { actor?: string; action?: string; entity?: string; from?: string; to?: string } = {}): Promise<Result<AuditLogEntry[]>> {
  return read(
    () => {
      const g = adminOnly<AuditLogEntry[]>();
      if (g) return g;
      return ok(
        getDb().audit.filter((a) => {
          const day = dhakaDateKey(a.at);
          return (
            (!filter.actor || a.actor.name.includes(filter.actor)) &&
            (!filter.action || a.action.includes(filter.action)) &&
            (!filter.entity || filter.entity === "all" || a.entityType === filter.entity) &&
            (!filter.from || day >= filter.from) &&
            (!filter.to || day <= filter.to)
          );
        }),
      );
    },
    { empty: () => [] },
  );
}

// ───────── AI health & settings ─────────

export async function getAiHealth(period: "24h" | "7d"): Promise<Result<AiHealthStats>> {
  return read(() => {
    const g = staffOnly<AiHealthStats>();
    if (g) return g;
    const db = getDb();
    if (db.faultInjection && new Date(db.faultInjection.expiresAt).getTime() <= Date.now()) db.faultInjection = null;
    return ok({ ...buildAiHealth(db.createdAt, period), faultInjection: db.faultInjection });
  });
}

/** Active fault injection (or null). Polled by the admin banner. */
export async function getFaultInjection(): Promise<Result<AiHealthStats["faultInjection"]>> {
  return read(() => {
    const db = getDb();
    if (db.faultInjection && new Date(db.faultInjection.expiresAt).getTime() <= Date.now()) db.faultInjection = null;
    return ok(db.faultInjection);
  });
}

export async function setFaultInjection(feature: AiFeature | null, mode: FaultMode | null): Promise<Result<AiHealthStats["faultInjection"]>> {
  return mutate(uid("fault"), () => {
    const g = staffOnly<AiHealthStats["faultInjection"]>();
    if (g) return g;
    const db = getDb();
    db.faultInjection = feature && mode ? { feature, mode, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } : null;
    audit("ai.fault_injection", "settings", "faultInjection", null, db.faultInjection ? { feature, mode } : { disabled: true });
    return ok(db.faultInjection);
  });
}

export async function getFeatureFlags(): Promise<Result<AdminSettings>> {
  return read(() => staffOnly<AdminSettings>() ?? ok(structuredClone(getDb().adminSettings)));
}

export async function setFeatureFlag(flag: keyof FeatureFlags, value: boolean, idempotencyKey: string): Promise<Result<AdminSettings>> {
  return mutate(idempotencyKey, () => {
    const g = adminOnly<AdminSettings>();
    if (g) return g;
    const s = getDb().adminSettings;
    audit("settings.flag", "settings", flag, { [flag]: s.flags[flag] }, { [flag]: value });
    s.flags[flag] = value;
    return ok(structuredClone(s));
  });
}

export async function savePlanSettings(quotas: AdminSettings["quotas"], premiumPriceBdt: number, idempotencyKey: string): Promise<Result<AdminSettings>> {
  return mutate(idempotencyKey, () => {
    const g = adminOnly<AdminSettings>();
    if (g) return g;
    const db = getDb();
    db.adminSettings.quotas = quotas;
    db.adminSettings.premiumPriceBdt = premiumPriceBdt;
    const premium = db.billing.plans.find((p) => p.id === "premium")!;
    premium.priceBdt = premiumPriceBdt;
    audit("settings.quotas", "settings", "quotas", null, { premiumPriceBdt });
    return ok(structuredClone(db.adminSettings));
  });
}
