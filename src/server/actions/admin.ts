"use server";

import { z } from "zod";
import { adminRoleSchema, circularActionPayload, circularPayload, organizationPayload, quotasPayload } from "@/schemas/api";
import { WORKFLOW_STEPS } from "@/types";
import type {
  AiFeature,
  AiHealthStats,
  FaultMode,
  WorkflowAction,
  WorkflowRun,
  WorkflowStepCode,
  AdminCircularRow,
  AdminSettings,
  AdminUser,
  Circular,
  CircularAction,
  FeatureFlags,
  Organization,
  Result,
} from "@/types";
import { after } from "next/server";
import { act, actDirect } from "@/server/api/act";
import { parse } from "@/server/api/validate";
import { requireUser } from "@/server/authz";
import { verifyPassword } from "@/server/supabase";
import * as admin from "@/server/services/admin";
import * as aiHealth from "@/server/services/ai-health";
import * as workflows from "@/server/services/workflows";
import * as circulars from "@/server/services/circulars";
import { invalidateAdminDashboard } from "@/server/services/dashboards";

const id = z.string().min(1).max(100);
const version = z.number().int().min(0);

export async function saveCircularAction(
  data: unknown,
  v: number | null,
  k: string,
  intent: "draft" | "submit" | "publish" = "draft",
): Promise<Result<Circular>> {
  const r = await act("circular.save", k, { data, v, intent }, (ctx, tx) =>
    circulars.saveCircular(ctx, tx, parse(circularPayload, data), v == null ? null : parse(version, v), parse(z.enum(["draft", "submit", "publish"]), intent)),
  );
  if (r.ok) invalidateAdminDashboard();
  return r;
}

export async function transitionCircularAction(
  circularId: string,
  action: CircularAction,
  payload: { reason?: string; newEndAt?: string },
  v: number,
  k: string,
): Promise<Result<AdminCircularRow>> {
  const r = await act("circular.transition", k, { circularId, action, payload, v }, (ctx, tx) =>
    circulars.transitionCircular(
      ctx,
      tx,
      parse(id, circularId),
      parse(z.enum(["submit_review", "approve", "reject", "extend", "cancel", "archive"]), action),
      parse(circularActionPayload, payload),
      parse(version, v),
    ),
  );
  if (r.ok) invalidateAdminDashboard();
  return r;
}

export async function decideReviewAction(
  itemId: string,
  decision: "approve" | "reject",
  payload: { reason?: string; fields?: Record<string, string> },
  k: string,
): Promise<Result<{ circularId: string }>> {
  const r = await act("review.decide", k, { itemId, decision, payload }, (ctx, tx) =>
    circulars.decideReview(
      ctx,
      tx,
      parse(id, itemId),
      parse(z.enum(["approve", "reject"]), decision),
      parse(z.object({ reason: z.string().trim().max(500).optional(), fields: z.record(z.string().max(60), z.string().max(500)).optional() }), payload),
    ),
  );
  if (r.ok) invalidateAdminDashboard();
  return r;
}

export async function saveOrganizationAction(data: unknown, orgId: string | null, v: number | null, k: string): Promise<Result<Organization>> {
  return act("organization.save", k, { data, orgId, v }, (ctx, tx) => {
    const p = parse(organizationPayload, data);
    return admin.saveOrganization(ctx, tx, { ...p, website: p.website || null }, orgId ? parse(id, orgId) : null, v);
  });
}

export async function setOrganizationVerifiedAction(orgId: string, verified: boolean, k: string): Promise<Result<Organization>> {
  return act("organization.verify", k, { orgId, verified }, (ctx, tx) => admin.setOrganizationVerified(ctx, tx, parse(id, orgId), parse(z.boolean(), verified)));
}

export async function changeUserRoleAction(userId: string, role: AdminUser["role"], adminPassword: string, k: string): Promise<Result<AdminUser>> {
  return act("user.role", k, { userId, role }, async (ctx, tx) => {
    requireUser(ctx.actor, "user.manage", { mutation: true });
    const ok = await verifyPassword(ctx.actor.kind === "user" ? ctx.actor.email : "", parse(z.string().min(1).max(200), adminPassword));
    return admin.changeUserRole(ctx, tx, parse(id, userId), parse(adminRoleSchema, role), ok);
  });
}

export async function setUserStatusAction(userId: string, status: AdminUser["status"], k: string): Promise<Result<AdminUser>> {
  return act("user.status", k, { userId, status }, (ctx, tx) => admin.setUserStatus(ctx, tx, parse(id, userId), parse(z.enum(["active", "suspended"]), status)));
}

export async function setFeatureFlagAction(flag: keyof FeatureFlags, value: boolean, k: string): Promise<Result<AdminSettings>> {
  return act("settings.flag", k, { flag, value }, (ctx, tx) =>
    admin.setFeatureFlag(ctx, tx, parse(z.enum(["autoPublish", "aiSearch", "aiCvParse", "aiResumeTailor", "aiCircularExtract"]), flag), parse(z.boolean(), value)),
  );
}

export async function savePlanSettingsAction(quotas: AdminSettings["quotas"], premiumPriceBdt: number, k: string): Promise<Result<AdminSettings>> {
  return act("settings.plans", k, { quotas, premiumPriceBdt }, (ctx, tx) =>
    admin.savePlanSettings(ctx, tx, parse(quotasPayload, quotas) as AdminSettings["quotas"], parse(z.number().int().min(0).max(10_000), premiumPriceBdt)),
  );
}

// ───────── Part 3: workflow & AI health ─────────

export async function workflowActionAction(
  runId: string,
  action: WorkflowAction,
  payload: { step?: WorkflowStepCode; reason?: string; json?: string },
  k: string,
): Promise<Result<WorkflowRun>> {
  const r = await act("workflow.action", k, { runId, action, payload }, (ctx, tx) =>
    workflows.workflowAction(
      ctx,
      tx,
      parse(id, runId),
      parse(z.enum(["retry_step", "run_from_step", "skip_step", "cancel_run", "fix_and_run"]), action),
      parse(z.object({ step: z.enum(WORKFLOW_STEPS).optional(), reason: z.string().trim().max(500).optional(), json: z.string().max(200_000).optional() }), payload),
    ),
  );
  if (r.ok && r.data.status === "running") after(() => workflows.runWorker(undefined, { runId, limit: 15 }).then(() => undefined));
  return r;
}

/** Admin "Run now": process due steps immediately. */
export async function runWorkerNowAction(): Promise<Result<{ processed: number }>> {
  return actDirect(async (ctx) => {
    requireUser(ctx.actor, "circular.moderate", { mutation: true });
    return { processed: await workflows.runWorker(undefined, { limit: 30 }) };
  });
}

export async function setFaultInjectionAction(feature: AiFeature | null, mode: FaultMode | null, k: string): Promise<Result<AiHealthStats["faultInjection"]>> {
  return act("ai.fault", k, { feature, mode }, (ctx, tx) =>
    aiHealth.setFaultInjection(
      ctx,
      tx,
      feature == null ? null : parse(z.enum(["search_parse", "cv_parse", "resume_tailor", "circular_extract", "tagging"]), feature),
      mode == null ? null : parse(z.enum(["timeout", "malformed_json", "wrong_schema", "hallucinated_values", "rate_limited_429", "server_error_500"]), mode),
    ),
  );
}
