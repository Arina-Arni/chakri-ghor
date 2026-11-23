// TEMP — replaced by the real implementation in Part 2
import { t } from "@/i18n";
import type {
  AdminSettings,
  AdminUser,
  AiHealthStats,
  AuditLogEntry,
  CircularRevision,
  ReviewQueueItem,
  WorkflowRun,
  WorkflowStep,
  WorkflowStepCode,
  WorkflowStepStatus,
} from "@/types";

const H = 3_600_000;
const DAY = 24 * H;

export const STEP_ORDER: WorkflowStepCode[] = [
  "fetch_source",
  "extract_text",
  "ai_extract",
  "validate",
  "dedupe",
  "review_gate",
  "publish",
  "notify",
];

const SKIPPABLE: WorkflowStepCode[] = ["dedupe", "notify"];

type StepPlan = Partial<Record<WorkflowStepCode, Partial<WorkflowStep>>>;

export function makeSteps(runId: string, startedAt: number, statuses: WorkflowStepStatus[], plan: StepPlan = {}): WorkflowStep[] {
  let cursor = startedAt;
  return STEP_ORDER.map((code, i) => {
    const status = statuses[i] ?? "pending";
    const duration = status === "succeeded" ? 400 + ((i * 937) % 2400) : status === "failed" ? 30_000 : null;
    const started = status === "pending" ? null : cursor;
    if (duration) cursor += duration;
    return {
      id: `${runId}_${code}`,
      runId,
      code,
      labelBn: t(`enums.workflowStep.${code}`),
      status,
      attempts: status === "pending" ? 0 : status === "failed" ? 3 : 1,
      maxAttempts: 3,
      startedAt: started ? new Date(started).toISOString() : null,
      finishedAt: duration && started ? new Date(started + duration).toISOString() : null,
      durationMs: duration,
      error: null,
      input: status === "pending" ? null : { runId, step: code },
      output: status === "succeeded" ? { ok: true } : null,
      skippable: SKIPPABLE.includes(code),
      ...plan[code],
    };
  });
}

export function buildRuns(now: number): WorkflowRun[] {
  const s = (n: WorkflowStepStatus, k: number): WorkflowStepStatus[] => Array(k).fill(n);
  const runs: WorkflowRun[] = [
    {
      id: "run_1042",
      source: { kind: "pdf_upload", label: "dc-khulna-niyog-2026.pdf" },
      status: "succeeded",
      currentStep: null,
      circularId: "cir_001",
      circularSlug: "dc-khulna-office-assistant-2026",
      startedAt: new Date(now - 12 * DAY).toISOString(),
      finishedAt: new Date(now - 12 * DAY + 9 * 60_000).toISOString(),
      durationMs: 9 * 60_000,
      steps: makeSteps("run_1042", now - 12 * DAY, s("succeeded", 8), {
        ai_extract: { output: { titleBn: "জেলা প্রশাসকের কার্যালয়, খুলনা — ৩য় ও ৪র্থ শ্রেণির পদে নিয়োগ", posts: 3, confidence: 0.93 } },
        review_gate: { output: { autoApproved: false, reviewer: "মডারেটর তানভীর" } },
      }),
    },
    {
      id: "run_1043",
      source: { kind: "pdf_url", label: "https://bbs.gov.bd/notice/enumerator-26.pdf" },
      status: "failed",
      currentStep: "ai_extract",
      circularId: null,
      circularSlug: null,
      startedAt: new Date(now - 3 * H).toISOString(),
      finishedAt: new Date(now - 3 * H + 95_000).toISOString(),
      durationMs: 95_000,
      steps: makeSteps("run_1043", now - 3 * H, [...s("succeeded", 2), "failed"], {
        ai_extract: {
          error: { code: "AI_MALFORMED_JSON", messageBn: "AI-এর উত্তর JSON হিসেবে পড়া যায়নি (৩ বার চেষ্টা)" },
          input: { textChars: 18422, model: "gemini", promptVersion: "extract-v3" },
        },
      }),
    },
    {
      id: "run_1044",
      source: { kind: "text", label: "পেস্ট করা লেখা (৪,২১০ অক্ষর)" },
      status: "waiting_review",
      currentStep: "review_gate",
      circularId: "cir_023",
      circularSlug: "review-bbs-enumerator",
      startedAt: new Date(now - 50 * 60_000).toISOString(),
      finishedAt: null,
      durationMs: null,
      steps: makeSteps("run_1044", now - 50 * 60_000, [...s("succeeded", 5), "waiting"], {
        review_gate: { output: null, input: { confidence: 0.62, lowConfidenceFields: ["ageMax", "vacancies"] } },
      }),
    },
    {
      id: "run_1045",
      source: { kind: "pdf_upload", label: "police-trc-2026-corrigendum.pdf" },
      status: "running",
      currentStep: "ai_extract",
      circularId: null,
      circularSlug: null,
      startedAt: new Date(now - 40_000).toISOString(),
      finishedAt: null,
      durationMs: null,
      steps: makeSteps("run_1045", now - 40_000, [...s("succeeded", 2), "running"]),
    },
    {
      id: "run_1041",
      source: { kind: "pdf_upload", label: "dss-barishal-26.pdf" },
      status: "succeeded",
      currentStep: null,
      circularId: "cir_015",
      circularSlug: "dss-office-sohayok-barishal",
      startedAt: new Date(now - 9 * DAY).toISOString(),
      finishedAt: new Date(now - 9 * DAY + 4 * 60_000).toISOString(),
      durationMs: 4 * 60_000,
      steps: makeSteps("run_1041", now - 9 * DAY, [...s("succeeded", 4), "skipped", ...s("succeeded", 3)], {
        dedupe: { output: { skippedReason: "মডারেটর: একই স্মারক নম্বরের পুরোনো বিজ্ঞপ্তি নেই" } },
      }),
    },
  ];
  return runs;
}

export function buildReviewQueue(now: number): ReviewQueueItem[] {
  return [
    {
      id: "rq_1",
      circularId: "cir_023",
      runId: "run_1044",
      titleBn: "পরিসংখ্যান ব্যুরো — গণনাকারী",
      source: "টেক্সট পেস্ট",
      confidence: 0.62,
      waitingSince: new Date(now - 45 * 60_000).toISOString(),
      pdfUrl: null,
      fields: [
        { key: "organization", labelBn: "প্রতিষ্ঠান", value: "বাংলাদেশ পরিসংখ্যান ব্যুরো", confidence: 0.97 },
        { key: "noticeNo", labelBn: "স্মারক নং", value: "বিবিএস/২৬/১৯", confidence: 0.91 },
        { key: "titleBn", labelBn: "পদের নাম", value: "গণনাকারী", confidence: 0.88 },
        { key: "vacancies", labelBn: "পদের সংখ্যা", value: "৩০০", confidence: 0.55 },
        { key: "ageMax", labelBn: "সর্বোচ্চ বয়স", value: "৩৫", confidence: 0.48 },
        { key: "endAt", labelBn: "আবেদনের শেষ সময়", value: "০৯/১২/২০২৬ ১৭:০০", confidence: 0.82 },
        { key: "minEducation", labelBn: "ন্যূনতম শিক্ষা", value: "এইচএসসি", confidence: 0.76 },
      ],
    },
    {
      id: "rq_2",
      circularId: "cir_022",
      runId: "run_1040",
      titleBn: "উপজেলা ভূমি অফিস — সার্ভেয়ার",
      source: "PDF আপলোড",
      confidence: 0.81,
      waitingSince: new Date(now - 5 * H).toISOString(),
      pdfUrl: "/sample-notice.pdf",
      fields: [
        { key: "organization", labelBn: "প্রতিষ্ঠান", value: "জেলা প্রশাসকের কার্যালয়, খুলনা", confidence: 0.95 },
        { key: "titleBn", labelBn: "পদের নাম", value: "সার্ভেয়ার", confidence: 0.9 },
        { key: "vacancies", labelBn: "পদের সংখ্যা", value: "৬", confidence: 0.86 },
        { key: "ageMax", labelBn: "সর্বোচ্চ বয়স", value: "৩২", confidence: 0.66 },
        { key: "endAt", labelBn: "আবেদনের শেষ সময়", value: "২৩/১২/২০২৬ ১৭:০০", confidence: 0.84 },
      ],
    },
  ];
}

export function buildUsers(now: number): AdminUser[] {
  const names: [string, string, AdminUser["role"], AdminUser["status"]][] = [
    ["রহিমা আক্তার", "rahima@example.com", "seeker", "active"],
    ["তানভীর হাসান", "tanvir@example.com", "moderator", "active"],
    ["নুসরাত জাহান", "nusrat@example.com", "admin", "active"],
    ["সাকিব আল মামুন", "sakib@example.com", "seeker", "active"],
    ["মৌসুমী রায়", "mousumi@example.com", "seeker", "suspended"],
    ["আরিফুল ইসলাম", "ariful@example.com", "seeker", "active"],
    ["ফারহানা ইয়াসমিন", "farhana@example.com", "moderator", "active"],
    ["জয়ন্ত দাস", "joyonto@example.com", "seeker", "active"],
    ["শামীমা নাসরিন", "shamima@example.com", "seeker", "active"],
    ["মাহমুদুল হক", "mahmud@example.com", "seeker", "active"],
    ["উম্মে কুলসুম", "kulsum@example.com", "seeker", "active"],
    ["রাকিবুল হাসান", "rakib@example.com", "seeker", "active"],
  ];
  return names.map(([name, email, role, status], i) => ({
    id: `usr_${i + 1}`,
    name,
    email,
    role,
    status,
    joinedAt: new Date(now - (i * 3 + 1) * DAY).toISOString(),
  }));
}

export function buildAudit(now: number): AuditLogEntry[] {
  const actor = { id: "usr_2", name: "তানভীর হাসান", role: "moderator" as const };
  const admin = { id: "usr_3", name: "নুসরাত জাহান", role: "admin" as const };
  const rows: Omit<AuditLogEntry, "id" | "requestId">[] = [
    { at: new Date(now - 30 * 60_000).toISOString(), actor, action: "circular.extend", entityType: "circular", entityId: "cir_003", before: { endAt: "২৬ নভেম্বর ২০২৬" }, after: { endAt: "০৩ ডিসেম্বর ২০২৬" } },
    { at: new Date(now - 2 * H).toISOString(), actor: admin, action: "user.suspend", entityType: "user", entityId: "usr_5", before: { status: "active" }, after: { status: "suspended" } },
    { at: new Date(now - 5 * H).toISOString(), actor, action: "circular.approve", entityType: "circular", entityId: "cir_001", before: { status: "in_review" }, after: { status: "published" } },
    { at: new Date(now - 9 * H).toISOString(), actor: admin, action: "settings.flag", entityType: "settings", entityId: "aiResumeTailor", before: { aiResumeTailor: false }, after: { aiResumeTailor: true } },
    { at: new Date(now - 26 * H).toISOString(), actor, action: "organization.verify", entityType: "organization", entityId: "org_nilachal", before: { verified: false }, after: { verified: true } },
    { at: new Date(now - 30 * H).toISOString(), actor, action: "circular.reject", entityType: "circular", entityId: "cir_024", before: { status: "in_review" }, after: { status: "rejected", reason: "উৎস যাচাই করা যায়নি" } },
    { at: new Date(now - 2 * DAY).toISOString(), actor: admin, action: "user.role_change", entityType: "user", entityId: "usr_7", before: { role: "seeker" }, after: { role: "moderator" } },
    { at: new Date(now - 3 * DAY).toISOString(), actor, action: "workflow.retry_step", entityType: "workflow_run", entityId: "run_1039", before: { step: "ai_extract", status: "failed" }, after: { step: "ai_extract", status: "succeeded" } },
  ];
  return rows.map((r, i) => ({ ...r, id: `aud_${i + 1}`, requestId: `REQ-${(48213 + i * 17).toString(36).toUpperCase()}` }));
}

export function buildAiHealth(now: number, period: "24h" | "7d"): AiHealthStats {
  const m = period === "24h" ? 1 : 7;
  return {
    period,
    features: [
      { feature: "search_parse", calls: 1840 * m, successPct: 96.4, fallbackPct: 3.6, p95Ms: 2100, breaker: { state: "closed", reopensAt: null } },
      { feature: "cv_parse", calls: 212 * m, successPct: 91.2, fallbackPct: 8.8, p95Ms: 5400, breaker: { state: "half_open", reopensAt: null } },
      { feature: "resume_tailor", calls: 96 * m, successPct: 71.5, fallbackPct: 28.5, p95Ms: 8800, breaker: { state: "open", reopensAt: new Date(now + 4 * 60_000 + 20_000).toISOString() } },
      { feature: "circular_extract", calls: 38 * m, successPct: 89.5, fallbackPct: 10.5, p95Ms: 14200, breaker: { state: "closed", reopensAt: null } },
    ],
    failures: [
      { id: "f1", at: new Date(now - 4 * 60_000).toISOString(), feature: "resume_tailor", outcome: "timeout", attempts: 3, latencyMs: 15000, message: "Gemini request exceeded 15 s" },
      { id: "f2", at: new Date(now - 9 * 60_000).toISOString(), feature: "resume_tailor", outcome: "rate_limited_429", attempts: 2, latencyMs: 820, message: "429 RESOURCE_EXHAUSTED" },
      { id: "f3", at: new Date(now - 3 * H).toISOString(), feature: "circular_extract", outcome: "malformed_json", attempts: 3, latencyMs: 11800, message: "Unexpected token in JSON at position 1532" },
      { id: "f4", at: new Date(now - 5 * H).toISOString(), feature: "cv_parse", outcome: "wrong_schema", attempts: 1, latencyMs: 4300, message: "experiences[0].startDate: expected date" },
      { id: "f5", at: new Date(now - 7 * H).toISOString(), feature: "search_parse", outcome: "fallback", attempts: 1, latencyMs: 4000, message: "Budget 4 s exceeded — keyword search used" },
      { id: "f6", at: new Date(now - 11 * H).toISOString(), feature: "cv_parse", outcome: "hallucinated_values", attempts: 1, latencyMs: 5100, message: "Phone number not present in source text" },
    ],
    faultInjection: null,
    faultInjectionAllowed: true,
  };
}

export function buildAdminSettings(): AdminSettings {
  return {
    flags: { autoPublish: false, aiSearch: true, aiCvParse: true, aiResumeTailor: true, aiCircularExtract: true },
    quotas: {
      free: { aiSearchPerDay: 10, resumeTailorPerDay: 1, cvParsePerDay: 2 },
      premium: { aiSearchPerDay: 100, resumeTailorPerDay: 10, cvParsePerDay: 10 },
    },
    premiumPriceBdt: 4,
  };
}

export function buildRevisions(now: number): CircularRevision[] {
  return [
    {
      id: "rev_2",
      at: new Date(now - 30 * 60_000).toISOString(),
      actorName: "তানভীর হাসান",
      changes: [{ field: "আবেদনের শেষ সময়", before: "২৬ নভেম্বর ২০২৬, বিকাল ৫:০০", after: "০৩ ডিসেম্বর ২০২৬, বিকাল ৫:০০" }],
    },
    {
      id: "rev_1",
      at: new Date(now - 3 * DAY).toISOString(),
      actorName: "নুসরাত জাহান",
      changes: [
        { field: "পদের সংখ্যা", before: "১২০০", after: "১২৬০" },
        { field: "আবেদন ফি", before: "৳৫০", after: "৳৫৬" },
      ],
    },
  ];
}
