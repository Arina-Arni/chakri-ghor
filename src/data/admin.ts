import type {
  AiFeature,
  AiHealthStats,
  FaultMode,
  IngestInput,
  WorkflowAction,
  WorkflowRun,
  WorkflowStepCode,
  AdminCircularRow,
  AdminSettings,
  AdminUser,
  AuditLogEntry,
  Circular,
  CircularAction,
  CircularRevision,
  CircularStatus,
  DashboardStats,
  FeatureFlags,
  Organization,
  Result,
  ReviewQueueItem,
} from "@/types";
import {
  changeUserRoleAction,
  decideReviewAction,
  saveCircularAction,
  saveOrganizationAction,
  savePlanSettingsAction,
  setFeatureFlagAction,
  setOrganizationVerifiedAction,
  setUserStatusAction,
  transitionCircularAction,
  runWorkerNowAction,
  setFaultInjectionAction,
  workflowActionAction,
} from "@/server/actions/admin";
import { fail, mutate, newKey, query } from "./_runtime";


// ───────── dashboard ─────────

export async function getAdminDashboard(): Promise<Result<DashboardStats>> {
  return query("getAdminDashboard");
}

// ───────── circulars ─────────

export async function listAdminCirculars(filters: { q?: string; status?: CircularStatus | "all" }): Promise<Result<AdminCircularRow[]>> {
  return query("listAdminCirculars", [filters], { empty: () => [] });
}

export async function getAdminCircular(id: string): Promise<Result<Circular>> {
  return query("getAdminCircular", [id]);
}

export type CircularDraft = Omit<
  Circular,
  | "id"
  | "slug"
  | "organization"
  | "status"
  | "totalVacancies"
  | "publishedAt"
  | "createdAt"
  | "updatedAt"
  | "version"
  | "originalEndAt"
  | "noticePdfUrl"
  | "aiTags"
  | "howToApplyBn"
> & { organizationId: string };

export async function saveCircular(
  data: CircularDraft & { id?: string | null },
  version: number | null,
  idempotencyKey: string,
  intent: "draft" | "submit" | "publish" = "draft",
): Promise<Result<Circular>> {
  return mutate(() => saveCircularAction(data, version, idempotencyKey, intent), { versioned: true });
}

export async function transitionCircular(
  id: string,
  action: CircularAction,
  payload: { reason?: string; newEndAt?: string },
  version: number,
  idempotencyKey: string,
): Promise<Result<AdminCircularRow>> {
  return mutate(() => transitionCircularAction(id, action, payload, version, idempotencyKey), { versioned: true });
}

export async function getCircularRevisions(id: string): Promise<Result<CircularRevision[]>> {
  return query("getCircularRevisions", [id], { empty: () => [] });
}

// ───────── review queue ─────────

export async function listReviewQueue(): Promise<Result<ReviewQueueItem[]>> {
  return query("listReviewQueue", [], { empty: () => [] });
}

export async function getReviewItem(id: string): Promise<Result<ReviewQueueItem>> {
  return query("getReviewItem", [id]);
}

export async function decideReview(
  id: string,
  decision: "approve" | "reject",
  payload: { reason?: string; fields?: Record<string, string> },
  idempotencyKey: string,
): Promise<Result<{ circularId: string }>> {
  return mutate(() => decideReviewAction(id, decision, payload, idempotencyKey));
}

// ───────── organizations ─────────

export async function listOrganizations(): Promise<Result<Organization[]>> {
  return query("listOrganizations", [], { empty: () => [], signedIn: false });
}

export async function saveOrganization(
  data: Pick<Organization, "nameBn" | "nameEn" | "shortName" | "type" | "website">,
  id: string | null,
  version: number | null,
  idempotencyKey: string,
): Promise<Result<Organization>> {
  return mutate(() => saveOrganizationAction(data, id, version, idempotencyKey), { versioned: true });
}

export async function setOrganizationVerified(id: string, verified: boolean, idempotencyKey: string): Promise<Result<Organization>> {
  return mutate(() => setOrganizationVerifiedAction(id, verified, idempotencyKey));
}

// ───────── users & audit (admin only) ─────────

export async function listUsers(filter: { q?: string; role?: string } = {}): Promise<Result<AdminUser[]>> {
  return query("listUsers", [filter], { empty: () => [] });
}

export async function changeUserRole(userId: string, role: AdminUser["role"], adminPassword: string, idempotencyKey: string): Promise<Result<AdminUser>> {
  return mutate(() => changeUserRoleAction(userId, role, adminPassword, idempotencyKey));
}

export async function setUserStatus(userId: string, status: AdminUser["status"], idempotencyKey: string): Promise<Result<AdminUser>> {
  return mutate(() => setUserStatusAction(userId, status, idempotencyKey));
}

export async function listAuditLogs(filter: { actor?: string; action?: string; entity?: string; from?: string; to?: string } = {}): Promise<Result<AuditLogEntry[]>> {
  return query("listAuditLogs", [filter], { empty: () => [] });
}

// ───────── settings ─────────

export async function getFeatureFlags(): Promise<Result<AdminSettings>> {
  return query("getFeatureFlags");
}

export async function setFeatureFlag(flag: keyof FeatureFlags, value: boolean, idempotencyKey: string): Promise<Result<AdminSettings>> {
  return mutate(() => setFeatureFlagAction(flag, value, idempotencyKey));
}

export async function savePlanSettings(quotas: AdminSettings["quotas"], premiumPriceBdt: number, idempotencyKey: string): Promise<Result<AdminSettings>> {
  return mutate(() => savePlanSettingsAction(quotas, premiumPriceBdt, idempotencyKey));
}

// ───────── ingestion workflow (A07) ─────────

/** Start an ingestion run (multipart: the PDF can be up to 15 MB, so not a Server Action). */
export async function ingest(input: IngestInput, idempotencyKey: string): Promise<Result<{ runId: string }>> {
  void idempotencyKey; // runs are idempotent by content hash (ingest:{sha256})
  const form = new FormData();
  form.append("kind", input.kind);
  if (input.failAtStep) form.append("failAt", input.failAtStep);
  if (input.kind === "pdf_upload") form.append("file", input.file);
  if (input.kind === "pdf_url") form.append("url", input.url);
  if (input.kind === "text") form.append("text", input.text);
  try {
    const res = await fetch("/api/admin/ingest", { method: "POST", body: form, credentials: "same-origin" });
    const body = (await res.json().catch(() => null)) as Result<{ runId: string }> | null;
    return body && typeof body.ok === "boolean" ? body : fail("UNKNOWN");
  } catch {
    return fail("NETWORK");
  }
}

export async function listWorkflowRuns(filter: { status?: string } = {}): Promise<Result<WorkflowRun[]>> {
  return query("listWorkflowRuns", [filter], { empty: () => [] });
}

export async function getWorkflowRun(id: string): Promise<Result<WorkflowRun>> {
  return query("getWorkflowRun", [id]);
}

export async function workflowAction(
  runId: string,
  action: WorkflowAction,
  payload: { step?: WorkflowStepCode; reason?: string; json?: string },
  idempotencyKey: string,
): Promise<Result<WorkflowRun>> {
  return mutate(() => workflowActionAction(runId, action, payload, idempotencyKey));
}

export async function runWorkerNow(): Promise<Result<{ processed: number }>> {
  return mutate(() => runWorkerNowAction());
}

// ───────── AI health & fault injection (A06) ─────────

export async function getAiHealth(period: "24h" | "7d"): Promise<Result<AiHealthStats>> {
  return query("getAiHealth", [period]);
}

/** The signed-in admin's own active fault injection (polled by the admin banner). */
export async function getFaultInjection(): Promise<Result<AiHealthStats["faultInjection"]>> {
  return query("getFaultInjection", [], { ignoreForced: true });
}

export async function setFaultInjection(feature: AiFeature | null, mode: FaultMode | null): Promise<Result<AiHealthStats["faultInjection"]>> {
  return mutate(() => setFaultInjectionAction(feature, mode, newKey()));
}