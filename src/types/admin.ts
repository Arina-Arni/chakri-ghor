import type { CircularStatus } from "./circular";
import type { Id, IsoDateTime } from "./common";
import type { Role } from "./profile";

export type DashboardStats = {
  openCirculars: number;
  openVacancies: number;
  closingToday: number;
  publishedToday: number;
  reviewPending: number;
  byCategory: { labelBn: string; count: number }[];
  byDivision: { labelBn: string; count: number }[];
  workflowRuns7d: { date: string; succeeded: number; failed: number; waiting: number }[];
  aiOutcomes: { labelBn: string; count: number }[];
  signupsPerDay: { date: string; count: number }[];
  topSearches: { query: string; count: number }[];
  zeroResultSearches: { query: string; count: number }[];
};

export type AdminCircularRow = {
  id: Id;
  slug: string;
  titleBn: string;
  organizationNameBn: string;
  status: CircularStatus;
  endAt: IsoDateTime;
  postCount: number;
  source: "manual" | "pdf_upload" | "pdf_url" | "text";
  updatedAt: IsoDateTime;
  version: number;
};

export type CircularAction =
  | "submit_review"
  | "approve"
  | "reject"
  | "extend"
  | "cancel"
  | "archive";

export type CircularRevision = {
  id: Id;
  at: IsoDateTime;
  actorName: string;
  changes: { field: string; before: string; after: string }[];
};

export type ReviewQueueItem = {
  id: Id;
  circularId: Id;
  runId: Id;
  titleBn: string;
  source: string;
  confidence: number;
  waitingSince: IsoDateTime;
  pdfUrl: string | null;
  /** Extracted fields with per-field confidence (0–1). */
  fields: { key: string; labelBn: string; value: string; confidence: number }[];
};

export type WorkflowStepCode =
  | "fetch_source"
  | "extract_text"
  | "ai_extract"
  | "validate"
  | "dedupe"
  | "review_gate"
  | "publish"
  | "notify";

export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "waiting";

export type WorkflowStep = {
  id: Id;
  runId: Id;
  code: WorkflowStepCode;
  labelBn: string;
  status: WorkflowStepStatus;
  attempts: number;
  maxAttempts: number;
  startedAt: IsoDateTime | null;
  finishedAt: IsoDateTime | null;
  durationMs: number | null;
  error: { code: string; messageBn: string } | null;
  input: unknown;
  output: unknown;
  skippable: boolean;
};

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "waiting_review"
  | "cancelled";

export type IngestSourceKind = "pdf_upload" | "text" | "pdf_url";

export type WorkflowRun = {
  id: Id;
  source: { kind: IngestSourceKind; label: string };
  status: WorkflowRunStatus;
  currentStep: WorkflowStepCode | null;
  circularId: Id | null;
  circularSlug: string | null;
  startedAt: IsoDateTime;
  finishedAt: IsoDateTime | null;
  durationMs: number | null;
  steps: WorkflowStep[];
};

export type WorkflowAction = "retry_step" | "run_from_step" | "skip_step" | "cancel_run" | "fix_and_run";

export type IngestInput =
  | { kind: "pdf_upload"; file: File; failAtStep?: WorkflowStepCode }
  | { kind: "text"; text: string; failAtStep?: WorkflowStepCode }
  | { kind: "pdf_url"; url: string; failAtStep?: WorkflowStepCode };

export type AiFeature = "search_parse" | "cv_parse" | "resume_tailor" | "circular_extract";

export type FaultMode =
  | "timeout"
  | "malformed_json"
  | "wrong_schema"
  | "hallucinated_values"
  | "rate_limited_429"
  | "server_error_500";

export type BreakerState = "closed" | "open" | "half_open";

export type FaultInjection = { feature: AiFeature; mode: FaultMode; expiresAt: IsoDateTime };

export type AiHealthStats = {
  period: "24h" | "7d";
  features: {
    feature: AiFeature;
    calls: number;
    successPct: number;
    fallbackPct: number;
    p95Ms: number;
    breaker: { state: BreakerState; reopensAt: IsoDateTime | null };
  }[];
  failures: {
    id: Id;
    at: IsoDateTime;
    feature: AiFeature;
    outcome: FaultMode | "fallback";
    attempts: number;
    latencyMs: number;
    message: string;
  }[];
  faultInjection: FaultInjection | null;
  faultInjectionAllowed: boolean;
};

export type AdminUser = {
  id: Id;
  name: string;
  email: string;
  role: Exclude<Role, "guest">;
  status: "active" | "suspended";
  joinedAt: IsoDateTime;
};

export type AuditLogEntry = {
  id: Id;
  at: IsoDateTime;
  actor: { id: Id; name: string; role: Role };
  action: string;
  entityType: "circular" | "organization" | "user" | "settings" | "workflow_run";
  entityId: Id;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string;
};

export type FeatureFlags = {
  autoPublish: boolean;
  aiSearch: boolean;
  aiCvParse: boolean;
  aiResumeTailor: boolean;
  aiCircularExtract: boolean;
};

export type AdminSettings = {
  flags: FeatureFlags;
  quotas: Record<"free" | "premium", { aiSearchPerDay: number; resumeTailorPerDay: number; cvParsePerDay: number }>;
  premiumPriceBdt: number;
};
