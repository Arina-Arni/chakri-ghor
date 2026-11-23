import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimNext, completeStep, succeeded } from "@/lib/workflow/engine";
import type { AiProvider, GenerateRequest } from "@/lib/ai/types";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { setAiForTests } from "@/server/ai/runtime";
import { drainOutbox, enqueueEmails, OUTBOX_MAX_ATTEMPTS } from "@/server/email/outbox";
import { runIdempotent } from "@/server/idempotency";
import { runScheduler } from "@/server/jobs/scheduler";
import { MockPaymentProvider } from "@/server/payments/provider";
import { consumeQuota } from "@/server/quota";
import * as adminSvc from "@/server/services/admin";
import * as aiHealth from "@/server/services/ai-health";
import * as billing from "@/server/services/billing";
import * as circ from "@/server/services/circulars";
import * as disc from "@/server/services/discovery";
import * as wf from "@/server/services/workflows";
import { MemoryBlobStore, setBlobStoreForTests } from "@/server/workflow/blobs";
import { ingestWorkflow } from "@/server/workflow/ingest";
import { seedId } from "../../scripts/seed/seed";
import { createWorld, expectCode, key, rows, type World } from "./helpers";

let w: World;
let db: Db;
let clock = 0;
const DAY = 86_400_000;

/** A fake Gemini that answers by feature (routed on the system prompt). */
const calls: GenerateRequest[] = [];
let extraction: Record<string, unknown> = {};
const provider: AiProvider = {
  model: "fake-flash",
  async generate(req) {
    calls.push(req);
    if (/categorize/.test(req.system)) return { text: JSON.stringify({ category_slug: "admin-office", tag_slugs: ["class-3"], confidence: 0.9 }) };
    if (/extract a Bangladeshi job circular/.test(req.system)) return { text: JSON.stringify(extraction) };
    if (/turn a Bangladeshi job seeker's search/.test(req.system)) {
      return { text: JSON.stringify({ keywords: ["অফিস সহকারী"], district_ids: ["dis_khulna", "dis_atlantis"], division_ids: [], sector: "government", category_slugs: [], job_type: null, work_mode: null, salary_min: null, education_level: null, deadline_within_days: null, confidence: 0.9 }) };
    }
    throw new Error("unexpected prompt");
  },
};

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function circularExtraction(over: Record<string, unknown> = {}) {
  const tag = Math.random().toString(36).slice(2, 8);
  return {
    organization_bn: "জেলা প্রশাসকের কার্যালয়, খুলনা",
    organization_en: "Deputy Commissioner's Office, Khulna",
    notice_no: `TEST-${tag}`,
    title_bn: `পরীক্ষামূলক বিজ্ঞপ্তি ${tag} — অফিস সহায়ক পদে নিয়োগ`,
    title_en: "DC Office Khulna — Office Support (test)",
    published_on: iso(clock - DAY),
    application_start_at: iso(clock - DAY),
    application_end_at: `${iso(clock + 10 * DAY)} 17:00`,
    age_reference_date: iso(clock - DAY),
    apply_url: "https://dck.teletalk.com.bd",
    apply_platform: "teletalk",
    fee_text: "১১২ টাকা",
    posts: [{ title_bn: "অফিস সহায়ক", title_en: "Office Support", vacancies: 9, min_education: "ssc", age_min: 18, age_max: 32, eligible_districts: ["খুলনা"], keywords_en: ["Microsoft Office"] }],
    overall_confidence: 0.92,
    ...over,
  };
}

/** Run the worker with a moving clock until the run stops being runnable. */
async function drain(runId: string, maxRounds = 30) {
  for (let i = 0; i < maxRounds; i++) {
    const n = await wf.runWorker(db, { runId, now: () => clock, limit: 20, workerId: "test-worker" });
    const [r] = await db.select({ status: s.workflowRuns.status }).from(s.workflowRuns).where(eq(s.workflowRuns.id, runId));
    if (n === 0 && r.status !== "running" && r.status !== "queued") return r.status;
    if (n === 0) clock += 120_000; // let backoff timers expire
  }
  throw new Error("run did not settle");
}

async function runStatus(runId: string) {
  const [r] = await db.select().from(s.workflowRuns).where(eq(s.workflowRuns.id, runId));
  const steps = await db.select().from(s.workflowSteps).where(eq(s.workflowSteps.runId, runId));
  return { run: r, step: (name: string) => steps.find((x) => x.name === name)! };
}

function text(n = 1) {
  return `নিয়োগ বিজ্ঞপ্তি ${n} — জেলা প্রশাসকের কার্যালয়, খুলনা। অফিস সহায়ক পদে ৯ জন নিয়োগ দেওয়া হবে। আবেদনের শেষ তারিখ উল্লেখিত। ${"বিস্তারিত ".repeat(10)}`;
}

beforeAll(async () => {
  w = await createWorld();
  db = w.db;
  clock = w.now;
  setBlobStoreForTests(new MemoryBlobStore());
  setAiForTests({ provider, faultInjectionAllowed: true });
  process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret-0123456789";
  // The second seeker also wants office jobs in Khulna (for batch tests).
  await db.update(s.preferences).set({ categoryIds: ["cat_admin"], districtIds: ["dis_khulna"] }).where(eq(s.preferences.userId, w.ids.other));
  await db.update(s.profiles).set({ dateOfBirth: "1999-01-01", homeDistrictId: "dis_khulna" }).where(eq(s.profiles.userId, w.ids.other));
  await db.insert(s.educations).values({ userId: w.ids.other, level: "hsc", degreeName: "HSC", institution: "x", passingYear: 2017 });
}, 180_000);

afterAll(async () => {
  setAiForTests(null);
  setBlobStoreForTests(null);
  await w?.close();
});

const ctxAt = (who: Parameters<World["ctx"]>[0]) => w.ctx(who, { now: clock });

// ───────── A07 ─────────

describe("A07 ingestion workflow", () => {
  it("runs every step, waits for review, resumes on approval and notifies matching seekers once", async () => {
    extraction = circularExtraction();
    const { runId, duplicate } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(1) });
    expect(duplicate).toBe(false);
    expect(await drain(runId)).toBe("waiting_review");
    const a = await runStatus(runId);
    expect(a.step("review_gate").status).toBe("waiting");
    expect(a.step("apply_update").status).toBe("skipped");
    const circularId = a.run.circularId!;
    const [c] = await db.select().from(s.circulars).where(eq(s.circulars.id, circularId));
    expect(c).toMatchObject({ status: "pending_review", source: "pipeline", categoryId: "cat_admin" });

    await runIdempotent(ctxAt("moderator"), "t", key(), 1, (tx) => circ.decideReview(ctxAt("moderator"), tx, circularId, "approve", {}));
    expect(await drain(runId)).toBe("succeeded");
    const b = await runStatus(runId);
    expect(b.step("publish").output).toMatchObject({ alreadyPublished: true });
    expect(b.step("notify_matches").output).toMatchObject({ done: true });
    const notes = rows(await db.execute(sql`select user_id from notifications where dedupe_key like ${`new_match:${circularId}:%`}`));
    expect(notes.map((n) => n.user_id).sort()).toEqual([w.ids.other, w.ids.seeker].sort());
    // Event log covers every change.
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from workflow_events where run_id = ${runId}`));
    expect(Number(n)).toBeGreaterThan(20);
  });

  it("the same content again is a duplicate run (no new work)", async () => {
    const again = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(1) });
    expect(again.duplicate).toBe(true);
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from workflow_runs where idempotency_key = ${`ingest:${again.runId}`} or id = ${again.runId}`));
    expect(Number(n)).toBe(1);
  });

  it("a duplicate PDF upload returns the existing run", async () => {
    extraction = circularExtraction();
    const bytes = new Uint8Array(readFileSync("public/sample-notice.pdf"));
    const first = await wf.startIngest(ctxAt("admin"), db, { kind: "pdf_upload", fileName: "notice.pdf", bytes });
    const second = await wf.startIngest(ctxAt("moderator"), db, { kind: "pdf_upload", fileName: "copy.pdf", bytes });
    expect(second).toEqual({ runId: first.runId, duplicate: true });
    const status = await drain(first.runId);
    expect(["waiting_review", "failed"]).toContain(status);
    expect((await runStatus(first.runId)).step("extract_text").status).toBe("succeeded");
  });

  it("judges' scenario: fails mid-way after earlier steps succeeded; Retry finishes with one circular and no duplicate notifications", async () => {
    await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => adminSvc.setFeatureFlag(ctxAt("admin"), tx, "autoPublish", true));
    await db.update(s.organizations).set({ verified: true }).where(eq(s.organizations.slug, "dc-office-khulna"));
    extraction = circularExtraction();
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(2), failAt: "notify_matches" }, { faultInjectionAllowed: true });
    expect(await drain(runId)).toBe("failed");
    const a = await runStatus(runId);
    for (const name of ["validate_input", "extract_text", "ai_extract", "normalize_validate", "dedupe", "tag_categorize", "create_draft", "review_gate", "publish"]) {
      expect(a.step(name).status).toBe(name === "apply_update" ? "skipped" : "succeeded");
    }
    expect(a.step("notify_matches")).toMatchObject({ status: "failed", attempts: 3, errorCode: "INJECTED_FAILURE" });
    const draftStartedAt = a.step("create_draft").startedAt;

    const after = await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => wf.workflowAction(ctxAt("admin"), tx, runId, "retry_step", {}));
    expect(after.status).toBe("running");
    expect(await drain(runId)).toBe("succeeded");
    const b = await runStatus(runId);
    expect(b.step("create_draft").startedAt).toEqual(draftStartedAt); // not re-run
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from circulars where id = ${b.run.circularId}`));
    expect(Number(n)).toBe(1);
    const dup = rows(await db.execute(sql`select user_id, count(*)::int c from notifications where dedupe_key like ${`new_match:${b.run.circularId}:%`} group by user_id`));
    expect(dup.every((r) => Number(r.c) === 1)).toBe(true);
    await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => adminSvc.setFeatureFlag(ctxAt("admin"), tx, "autoPublish", false));
  });

  it("re-running a completed step (Resume from step) does not duplicate data", async () => {
    extraction = circularExtraction();
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(3) });
    await drain(runId);
    const before = await runStatus(runId);
    await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => wf.workflowAction(ctxAt("admin"), tx, runId, "run_from_step", { step: "create_draft" }));
    await drain(runId);
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from circular_posts where circular_id = ${before.run.circularId}`));
    expect(Number(n)).toBe(1);
  });

  it("a corrigendum (later deadline, same notice no.) updates the existing circular instead of creating one", async () => {
    const [existing] = await db.select().from(s.circulars).where(eq(s.circulars.slug, "dc-khulna-office-assistant-2026"));
    const before = existing.applicationEndAt.getTime();
    extraction = circularExtraction({ notice_no: existing.noticeNo, application_end_at: `${iso(before + 20 * DAY)} 17:00` });
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(4) });
    expect(await drain(runId)).toBe("succeeded");
    const r = await runStatus(runId);
    expect(r.step("apply_update").status).toBe("succeeded");
    expect(r.step("create_draft").status).toBe("skipped");
    expect(r.run.circularId).toBe(existing.id);
    const [now] = await db.select().from(s.circulars).where(eq(s.circulars.id, existing.id));
    expect(now.applicationEndAt.getTime()).toBeGreaterThan(before);
  });

  it("an exact duplicate (same notice, same deadline) ends the run as duplicate", async () => {
    const [existing] = await db.select().from(s.circulars).where(eq(s.circulars.slug, "bsc-senior-officer-2026"));
    const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, existing.organizationId));
    extraction = circularExtraction({ organization_bn: org.nameBn, organization_en: org.nameEn, notice_no: existing.noticeNo, application_end_at: existing.applicationEndAt.toISOString() });
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(5) });
    expect(await drain(runId)).toBe("duplicate");
    expect((await runStatus(runId)).run.circularId).toBe(existing.id);
  });

  it("invalid critical fields stop the run; Edit & continue fixes it", async () => {
    extraction = circularExtraction({ application_end_at: "শীঘ্রই জানানো হবে" });
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(6) });
    expect(await drain(runId)).toBe("failed");
    expect((await runStatus(runId)).step("normalize_validate").errorCode).toBe("INVALID_FIELDS");
    const fixed = JSON.stringify(circularExtraction());
    await runIdempotent(ctxAt("moderator"), "t", key(), 1, (tx) => wf.workflowAction(ctxAt("moderator"), tx, runId, "fix_and_run", { json: fixed }));
    expect(await drain(runId)).toBe("waiting_review");
  });

  it("cancelling after create_draft soft-deletes the draft (compensation)", async () => {
    extraction = circularExtraction();
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(7) });
    await drain(runId);
    const { run } = await runStatus(runId);
    await runIdempotent(ctxAt("moderator"), "t", key(), 1, (tx) => wf.workflowAction(ctxAt("moderator"), tx, runId, "cancel_run", {}));
    const [c] = await db.select().from(s.circulars).where(eq(s.circulars.id, run.circularId!));
    expect(c.deletedAt).not.toBeNull();
  });

  it("skip is allowed only for tag_categorize / notify_matches, with a reason", async () => {
    extraction = circularExtraction({ application_end_at: "?" });
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(8) });
    await drain(runId);
    await expectCode(runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => wf.workflowAction(ctxAt("admin"), tx, runId, "skip_step", { step: "normalize_validate", reason: "no thanks" })), "VALIDATION");
  });

  it("an expired lease is reclaimed and the old worker's result is discarded", async () => {
    extraction = circularExtraction();
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(9) });
    const t0 = clock;
    const a = await claimNext(db, "worker-A", t0, runId);
    expect(a?.name).toBe("validate_input");
    expect(await claimNext(db, "worker-B", t0 + 60_000, runId)).toBeNull(); // lease still held
    const b = await claimNext(db, "worker-B", t0 + 3 * 60_000, runId); // A crashed; lease expired
    expect(b?.id).toBe(a!.id);
    expect(await completeStep(db, ingestWorkflow, a!, "worker-A", succeeded({ stale: true }), t0 + 3 * 60_000)).toBe(false);
    expect(await completeStep(db, ingestWorkflow, b!, "worker-B", succeeded({ ok: true }), t0 + 3 * 60_000)).toBe(true);
  });

  it("two concurrent workers never process the same step twice", async () => {
    extraction = circularExtraction();
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(10) });
    await Promise.all([wf.runWorker(db, { runId, now: () => clock, workerId: "W1" }), wf.runWorker(db, { runId, now: () => clock, workerId: "W2" })]);
    await drain(runId);
    const started = rows(await db.execute(sql`select step_name, count(*)::int c from workflow_events where run_id = ${runId} and type = 'step.succeeded' group by step_name`));
    expect(started.every((r) => Number(r.c) === 1)).toBe(true);
  });

  it("notify_matches resumes from its batch cursor after a failure", async () => {
    await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => adminSvc.setFeatureFlag(ctxAt("admin"), tx, "autoPublish", true));
    extraction = circularExtraction();
    const { runId } = await wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(11) }, { faultInjectionAllowed: true });
    await db.update(s.workflowRuns).set({ input: sql`${s.workflowRuns.input} || '{"notifyBatch": 1, "failAfterBatches": 1}'::jsonb` }).where(eq(s.workflowRuns.id, runId));
    expect(await drain(runId)).toBe("failed");
    const failedStep = (await runStatus(runId)).step("notify_matches");
    expect(failedStep.output).toMatchObject({ batches: 1, notified: 1 });
    await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => wf.workflowAction(ctxAt("admin"), tx, runId, "retry_step", {}));
    expect(await drain(runId)).toBe("succeeded");
    const done = (await runStatus(runId)).step("notify_matches").output as { batches: number; notified: number };
    expect(done.notified).toBe(2);
    expect(done.batches).toBeGreaterThanOrEqual(2);
    await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => adminSvc.setFeatureFlag(ctxAt("admin"), tx, "autoPublish", false));
  });

  it("only staff start runs; only admins on an allowed server use failAt; seekers cannot act on runs", async () => {
    await expectCode(wf.startIngest(ctxAt("seeker"), db, { kind: "text", text: text(12) }), "FORBIDDEN");
    await expectCode(wf.startIngest(ctxAt("moderator"), db, { kind: "text", text: text(12), failAt: "publish" }, { faultInjectionAllowed: true }), "FORBIDDEN");
    await expectCode(wf.startIngest(ctxAt("admin"), db, { kind: "text", text: text(12), failAt: "publish" }, { faultInjectionAllowed: false }), "FORBIDDEN");
    const [run] = await db.select().from(s.workflowRuns).limit(1);
    await expectCode(runIdempotent(ctxAt("seeker"), "t", key(), 1, (tx) => wf.workflowAction(ctxAt("seeker"), tx, run.id, "cancel_run", {})), "FORBIDDEN");
    await expectCode(wf.listWorkflowRuns(ctxAt("seeker"), db, {}), "FORBIDDEN");
  });

  it("seeded demo: the run failed at notify_matches completes after Retry", async () => {
    const runId = seedId("run:demo-failed");
    await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => wf.workflowAction(ctxAt("admin"), tx, runId, "retry_step", {}));
    expect(await drain(runId)).toBe("succeeded");
  });
});

// ───────── A06 through the real services ─────────

describe("A06 in the app", () => {
  it("AI search produces filters, drops a hallucinated district and logs ai_calls", async () => {
    const parsed = await disc.parseSearchQuery(ctxAt("seeker"), db, "খুলনায় সরকারি অফিস সহকারী");
    expect(parsed.mode).toBe("ai");
    expect(parsed.filters).toMatchObject({ district: ["dis_khulna"], sector: ["government"] });
    const [log] = rows(await db.execute(sql`select outcome, error_message from ai_calls where feature = 'search_parse' order by created_at desc limit 1`));
    expect(log.outcome).toBe("success");
    expect(log.error_message).toMatch(/dis_atlantis/);
  });

  it("fault injection affects only the admin who enabled it, and is audit-logged", async () => {
    await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => aiHealth.setFaultInjection(ctxAt("admin"), tx, "search_parse", "server_error_500", true));
    const adminParse = await disc.parseSearchQuery(ctxAt("admin"), db, "রংপুরে সরকারি চাকরি");
    expect(adminParse.mode).toBe("fallback");
    const seekerParse = await disc.parseSearchQuery(ctxAt("other"), db, "রংপুরে সরকারি চাকরি");
    expect(seekerParse.mode).toBe("ai");
    const health = await aiHealth.getAiHealth(ctxAt("admin"), db, "24h");
    expect(health.faultInjection).toMatchObject({ feature: "search_parse", mode: "server_error_500" });
    expect(health.failures.some((f) => f.feature === "search_parse" && f.outcome === "provider_error")).toBe(true);
    await runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => aiHealth.setFaultInjection(ctxAt("admin"), tx, null, null, true));
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from audit_logs where action = 'ai.fault_injection'`));
    expect(Number(n)).toBe(2);
  });

  it("only admins may inject faults, and only when allowed", async () => {
    await expectCode(runIdempotent(ctxAt("moderator"), "t", key(), 1, (tx) => aiHealth.setFaultInjection(ctxAt("moderator"), tx, "cv_parse", "timeout", true)), "FORBIDDEN");
    await expectCode(runIdempotent(ctxAt("admin"), "t", key(), 1, (tx) => aiHealth.setFaultInjection(ctxAt("admin"), tx, "cv_parse", "timeout", false)), "FORBIDDEN");
    await expectCode(aiHealth.getAiHealth(ctxAt("seeker"), db, "24h"), "FORBIDDEN");
  });

  it("quota exceeded → 429 without calling the AI", async () => {
    const guest = { ...w.ctx("guest"), ipHash: "quota-test-ip", now: () => clock };
    for (let i = 0; i < 3; i++) await consumeQuota(guest, db, "ai_search");
    const before = calls.length;
    await expectCode(disc.parseSearchQuery(guest, db, "যেকোনো"), "QUOTA_EXCEEDED");
    expect(calls.length).toBe(before);
  });
});

// ───────── scheduler, outbox, payments ─────────

describe("scheduler & email outbox", () => {
  it("reminders are sent once per threshold — a second run creates nothing", async () => {
    const t = clock;
    const first = await runScheduler(db, t);
    expect(first.deadline).toBeGreaterThan(0);
    const second = await runScheduler(db, t);
    expect(second).toMatchObject({ deadline: 0, exam: 0, closed: 0, emailsQueued: 0 });
  });

  it("auto-closes circulars past their deadline", async () => {
    const [c] = await db.select().from(s.circulars).where(eq(s.circulars.status, "published")).limit(1);
    const r = await runScheduler(db, c.applicationEndAt.getTime() + 1000);
    expect(r.closed).toBeGreaterThan(0);
    const [after] = await db.select().from(s.circulars).where(eq(s.circulars.id, c.id));
    expect(after.status).toBe("closed");
  });

  it("outbox retries with backoff and marks dead after 5 attempts; in-app notifications stay", async () => {
    await enqueueEmails(db, {});
    const [row] = await db.select().from(s.emailOutbox).where(eq(s.emailOutbox.status, "pending")).limit(1);
    const failing = { send: async () => Promise.reject(new Error("smtp down")) };
    const render = async () => ({ subject: "s", html: "h", text: "t" });
    let t = clock;
    for (let i = 0; i < OUTBOX_MAX_ATTEMPTS; i++) {
      await db.update(s.emailOutbox).set({ nextAttemptAt: new Date(t) }).where(eq(s.emailOutbox.id, row.id));
      await drainOutbox(db, failing, render, t, 500);
      t += 3_600_000;
    }
    const [dead] = await db.select().from(s.emailOutbox).where(eq(s.emailOutbox.id, row.id));
    expect(dead).toMatchObject({ status: "dead", attempts: 5 });
    const [n] = await db.select().from(s.notifications).where(eq(s.notifications.id, dead.notificationId!));
    expect(n).toBeTruthy();
    const [note] = await db
      .insert(s.notifications)
      .values({ userId: w.ids.seeker, type: "system", title: "পরীক্ষা", body: "পরীক্ষা", dedupeKey: `outbox-test:${key()}` })
      .returning();
    expect(await enqueueEmails(db, { notificationIds: [note.id] })).toBe(1);
    const ok = { send: async () => ({ id: "msg_1" }) };
    const stats = await drainOutbox(db, ok, render, t, 5);
    expect(stats.sent).toBeGreaterThan(0);
  });
});

describe("plans, trial and mock payments", () => {
  it("trial once; a duplicate webhook never extends the period twice", async () => {
    const t1 = await runIdempotent(ctxAt("other"), "t", key(), 1, (tx) => billing.startTrial(ctxAt("other"), tx));
    expect(t1.subscription.status).toBe("trialing");
    await expectCode(runIdempotent(ctxAt("other"), "t", key(), 1, (tx) => billing.startTrial(ctxAt("other"), tx)), "DUPLICATE");

    const mock = new MockPaymentProvider(process.env.PAYMENT_WEBHOOK_SECRET!);
    const hook = mock.buildWebhook({ txnId: "txn-test-1", status: "succeeded", amountBdt: 120, userId: w.ids.seeker, periodDays: 30 });
    expect(await billing.handlePaymentWebhook(hook.body, hook.signature, clock)).toEqual({ applied: true });
    const [sub1] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.userId, w.ids.seeker));
    expect(await billing.handlePaymentWebhook(hook.body, hook.signature, clock)).toEqual({ applied: false });
    const [sub2] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.userId, w.ids.seeker));
    expect(sub2.currentPeriodEnd).toEqual(sub1.currentPeriodEnd);
    expect(sub2.status).toBe("active");
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from payments where provider_txn_id = 'txn-test-1'`));
    expect(Number(n)).toBe(1);
  });

  it("rejects a forged webhook signature", async () => {
    const body = JSON.stringify({ txnId: "forged", status: "succeeded", userId: w.ids.other, amountBdt: 1, periodDays: 365 });
    await expectCode(billing.handlePaymentWebhook(body, "deadbeef", clock), "FORBIDDEN");
  });

  it("premium quotas apply during the paid period", async () => {
    const b = await billing.getBilling(ctxAt("seeker"), db);
    expect(b.subscription.planId).toBe("premium");
    expect(b.usage.find((u) => u.feature === "ai_search")!.limit).toBe(100);
  });

  it("the active period moves to grace then expires (scheduler), falling back to free quotas", async () => {
    const [sub] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.userId, w.ids.seeker));
    const end = sub.currentPeriodEnd!.getTime();
    await runScheduler(db, end + 1000);
    const [g] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.userId, w.ids.seeker));
    expect(g.status).toBe("grace");
    await runScheduler(db, end + 4 * DAY);
    const [x] = await db.select().from(s.subscriptions).where(and(eq(s.subscriptions.userId, w.ids.seeker)));
    expect(x.status).toBe("expired");
  });
});
