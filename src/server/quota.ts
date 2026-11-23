import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { dhakaDateKey, dhakaToUtc } from "@/domain/bn";
import { effectivePlan, FREE, type SubState } from "@/domain/state-machines/subscription";
import { t } from "@/i18n";
import type { UsageFeature } from "@/types";
import type { Ctx } from "@/server/context";
import type { DbOrTx } from "@/server/db/client";
import { plans, subscriptions, usageCounters, type PlanQuotas } from "@/server/db/schema";
import { AppError } from "@/server/errors";

export { DEFAULT_PLANS } from "./quota-defaults";
import { DEFAULT_PLANS } from "./quota-defaults";

/** Guests (by salted IP hash): a few AI searches a day, nothing else. */
export const GUEST_QUOTAS: Record<UsageFeature, number> = { ai_search: 3, cv_parse: 0, resume_tailor: 0 };

const QUOTA_KEY: Record<UsageFeature, keyof PlanQuotas> = {
  ai_search: "ai_search_per_day",
  cv_parse: "cv_parse_per_day",
  resume_tailor: "tailored_resume_per_day",
};

export function dayWindow(now: number): { start: Date; resetsAt: Date } {
  const start = dhakaToUtc(dhakaDateKey(now), "00:00");
  return { start, resetsAt: new Date(start.getTime() + 86_400_000) };
}

export function subStateOf(row: typeof subscriptions.$inferSelect | undefined): SubState {
  if (!row) return FREE;
  return {
    status: row.status,
    planCode: row.planId === "premium" ? "premium" : "free",
    trialEndsAt: row.trialEndsAt?.getTime() ?? null,
    currentPeriodStart: row.currentPeriodStart?.getTime() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.getTime() ?? null,
    graceEndsAt: row.graceEndsAt?.getTime() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    trialUsed: row.trialUsed,
  };
}

export async function planQuotas(db: DbOrTx): Promise<Record<"free" | "premium", PlanQuotas>> {
  const rows = await db.select().from(plans).where(inArray(plans.code, ["free", "premium"]));
  const by = new Map(rows.map((r) => [r.code, r.quotas]));
  return { free: by.get("free") ?? DEFAULT_PLANS[0].quotas, premium: by.get("premium") ?? DEFAULT_PLANS[1].quotas };
}

/** Limit for this caller and feature today. */
export async function limitFor(ctx: Ctx, db: DbOrTx, feature: UsageFeature): Promise<{ subject: string; limit: number; audience: "guest" | "user" }> {
  if (ctx.actor.kind !== "user") return { subject: `ip:${ctx.ipHash ?? "unknown"}`, limit: GUEST_QUOTAS[feature], audience: "guest" };
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.actor.userId));
  const plan = effectivePlan(subStateOf(sub), ctx.now());
  const quotas = await planQuotas(db);
  return { subject: ctx.actor.userId, limit: quotas[plan][QUOTA_KEY[feature]], audience: "user" };
}

/**
 * Count one use and refuse when over the plan's daily quota — before any AI call (spec §2.6).
 * The increment is a single atomic upsert.
 */
export async function consumeQuota(ctx: Ctx, db: DbOrTx, feature: UsageFeature): Promise<{ used: number; limit: number }> {
  const { subject, limit, audience } = await limitFor(ctx, db, feature);
  const { start, resetsAt } = dayWindow(ctx.now());
  const quotaError = (used: number) =>
    new AppError("QUOTA_EXCEEDED", {
      message_bn: audience === "guest" ? t("search.quotaGuest") : t("errors.QUOTA_EXCEEDED"),
      retryAfterSec: Math.max(60, Math.round((resetsAt.getTime() - ctx.now()) / 1000)),
      fields: { audience, used: String(Math.min(used, limit)), limit: String(limit), remaining: "0", resetsAt: resetsAt.toISOString() },
    });
  if (limit <= 0) throw quotaError(0);
  const [row] = await db
    .insert(usageCounters)
    .values({ subject, feature, windowStart: start, count: 1 })
    .onConflictDoUpdate({ target: [usageCounters.subject, usageCounters.feature, usageCounters.windowStart], set: { count: sql`${usageCounters.count} + 1` } })
    .returning({ count: usageCounters.count });
  if (row.count > limit) throw quotaError(row.count);
  return { used: row.count, limit };
}

export async function usedToday(db: DbOrTx, subject: string, feature: UsageFeature, now: number): Promise<number> {
  const [row] = await db
    .select({ count: usageCounters.count })
    .from(usageCounters)
    .where(and(eq(usageCounters.subject, subject), eq(usageCounters.feature, feature), eq(usageCounters.windowStart, dayWindow(now).start)));
  return row?.count ?? 0;
}
