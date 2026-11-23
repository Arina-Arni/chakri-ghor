// TEMP — the ingestion workflow (A07) and AI health/fault tolerance (A06) arrive in Part 3.
// Until then these screens run on an in-memory simulation in the browser. Nothing here
// touches the database.
import { t } from "@/i18n";
import type { AiFeature, AiHealthStats, FaultMode, IngestInput, Result, WorkflowAction, WorkflowRun, WorkflowStepCode } from "@/types";
import { fail, mutate, query } from "../_runtime";
import { STEP_ORDER, buildAiHealth, buildRuns, makeSteps } from "./workflow-fixtures";

const STEP_MS = 2500;

type Store = { createdAt: number; runs: WorkflowRun[]; faultInjection: AiHealthStats["faultInjection"]; next: number };
let store: Store | null = null;

function db(): Store {
  if (store) return store;
  const now = Date.now();
  store = { createdAt: now, runs: buildRuns(now), faultInjection: null, next: 1046 };
  return store;
}

type Sim = { startMs: number; fromIndex: number; failAt: WorkflowStepCode | null };
const sims = new Map<string, Sim>();

function ensureSeedSims() {
  const running = db().runs.find((r) => r.id === "run_1045");
  if (running && running.status === "running" && !sims.has(running.id)) sims.set(running.id, { startMs: Date.now(), fromIndex: 2, failAt: null });
}

function advance(run: WorkflowRun) {
  const sim = sims.get(run.id);
  if (!sim || run.status !== "running") return;
  const now = Date.now();
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
      if (step.code === "review_gate") {
        Object.assign(step, { status: "waiting", attempts: 1, startedAt: new Date(stepStart).toISOString(), input: { confidence: 0.74 } });
        run.status = "waiting_review";
        run.currentStep = "review_gate";
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
    } else if (i === reached) {
      Object.assign(step, { status: "running", attempts: Math.max(1, step.attempts), startedAt: new Date(stepStart).toISOString() });
      run.currentStep = step.code;
      return;
    }
  }
  if (reached >= STEP_ORDER.length) {
    run.status = "succeeded";
    run.currentStep = null;
    run.finishedAt = new Date().toISOString();
    run.durationMs = now - new Date(run.startedAt).getTime();
    sims.delete(run.id);
  }
}

const staff = async (): Promise<Result<null>> => {
  const me = await query<{ role: string } | null>("getMe", [], { ignoreForced: true });
  return me.ok && me.data && (me.data.role === "admin" || me.data.role === "moderator") ? { ok: true, data: null } : fail("FORBIDDEN");
};

export async function ingest(input: IngestInput, idempotencyKey: string): Promise<Result<{ runId: string }>> {
  void idempotencyKey;
  return mutate(async () => {
    const g = await staff();
    if (!g.ok) return g;
    const s = db();
    const label = input.kind === "pdf_upload" ? input.file.name : input.kind === "pdf_url" ? input.url : `পেস্ট করা লেখা (${input.text.length} অক্ষর)`;
    if (input.kind !== "text") {
      const dup = s.runs.find((r) => r.source.label === label && r.status !== "failed" && r.status !== "cancelled");
      if (dup) return fail<{ runId: string }>("DUPLICATE", { message_bn: t("admin.ingest.duplicate"), fields: { runId: dup.id } });
    }
    if (input.kind === "pdf_url" && !/(\.gov\.bd|teletalk\.com\.bd)(\/|$)/.test(new URL(input.url).hostname + "/")) {
      return fail<{ runId: string }>("VALIDATION", { fields: { url: t("admin.ingest.urlHint") } });
    }
    const id = `run_${s.next++}`;
    const start = Date.now();
    s.runs.unshift({
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
    return { ok: true, data: { runId: id } };
  });
}

export async function listWorkflowRuns(filter: { status?: string } = {}): Promise<Result<WorkflowRun[]>> {
  const g = await staff();
  if (!g.ok) return g;
  ensureSeedSims();
  const runs = db().runs;
  runs.forEach(advance);
  return { ok: true, data: structuredClone(filter.status ? runs.filter((r) => r.status === filter.status) : runs) };
}

export async function getWorkflowRun(id: string): Promise<Result<WorkflowRun>> {
  const g = await staff();
  if (!g.ok) return g;
  ensureSeedSims();
  const run = db().runs.find((r) => r.id === id);
  if (!run) return fail("NOT_FOUND");
  advance(run);
  return { ok: true, data: structuredClone(run) };
}

export async function workflowAction(
  runId: string,
  action: WorkflowAction,
  payload: { step?: WorkflowStepCode; reason?: string; json?: string },
  idempotencyKey: string,
): Promise<Result<WorkflowRun>> {
  void idempotencyKey;
  return mutate(async () => {
    const g = await staff();
    if (!g.ok) return g;
    const run = db().runs.find((r) => r.id === runId);
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
        run.finishedAt = new Date().toISOString();
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
        Object.assign(run.steps[failed], { status: "succeeded", output: parsed, error: null, finishedAt: new Date().toISOString(), durationMs: 0 });
        restartFrom(failed + 1);
        break;
      }
    }
    return { ok: true, data: structuredClone(run) };
  });
}

export async function getAiHealth(period: "24h" | "7d"): Promise<Result<AiHealthStats>> {
  const g = await staff();
  if (!g.ok) return g;
  const s = db();
  if (s.faultInjection && new Date(s.faultInjection.expiresAt).getTime() <= Date.now()) s.faultInjection = null;
  return { ok: true, data: { ...buildAiHealth(s.createdAt, period), faultInjection: s.faultInjection } };
}

export async function getFaultInjection(): Promise<Result<AiHealthStats["faultInjection"]>> {
  const s = db();
  if (s.faultInjection && new Date(s.faultInjection.expiresAt).getTime() <= Date.now()) s.faultInjection = null;
  return { ok: true, data: s.faultInjection };
}

export async function setFaultInjection(feature: AiFeature | null, mode: FaultMode | null): Promise<Result<AiHealthStats["faultInjection"]>> {
  return mutate(async () => {
    const g = await staff();
    if (!g.ok) return g;
    const s = db();
    s.faultInjection = feature && mode ? { feature, mode, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } : null;
    return { ok: true, data: s.faultInjection };
  });
}
