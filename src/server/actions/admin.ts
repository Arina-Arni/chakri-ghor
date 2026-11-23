"use server";

import { z } from "zod";
import { adminRoleSchema, circularActionPayload, circularPayload, organizationPayload, quotasPayload } from "@/schemas/api";
import type {
  AdminCircularRow,
  AdminSettings,
  AdminUser,
  Circular,
  CircularAction,
  FeatureFlags,
  Organization,
  Result,
} from "@/types";
import { act } from "@/server/api/act";
import { parse } from "@/server/api/validate";
import { requireUser } from "@/server/authz";
import { verifyPassword } from "@/server/supabase";
import * as admin from "@/server/services/admin";
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
