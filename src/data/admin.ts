import type {
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
} from "@/server/actions/admin";
import { mutate, query } from "./_runtime";

// TEMP until Part 3: ingestion workflow runs and AI health.
export { getAiHealth, getFaultInjection, getWorkflowRun, ingest, listWorkflowRuns, setFaultInjection, workflowAction } from "./temp/workflow";

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
