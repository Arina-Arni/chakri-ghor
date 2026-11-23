import "server-only";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { dhakaDateKey, dhakaToUtc, toBnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import type { AdminSettings, Billing, Plan } from "@/types";
import { authorize, requireUser } from "@/server/authz";
import type { Ctx } from "@/server/context";
import type { DbOrTx, Tx } from "@/server/db/client";
import { cvParseJobs, resumes, searchLogs, subscriptions } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { readSettings } from "./admin";

const DAY = 86_400_000;

export function plansFrom(s: AdminSettings): Plan[] {
  const p = s.quotas.premium;
  return [
    {
      id: "free",
      nameBn: "ফ্রি",
      priceBdt: 0,
      period: "day",
      featuresBn: ["সব সার্কুলার ও ফিল্টার", "যোগ্যতা যাচাই", "আবেদন ট্র্যাকার", "শেষ সময়ের রিমাইন্ডার"],
      quotas: { ai_search: s.quotas.free.aiSearchPerDay, resume_tailor: s.quotas.free.resumeTailorPerDay, cv_parse: s.quotas.free.cvParsePerDay },
    },
    {
      id: "premium",
      nameBn: "প্রিমিয়াম",
      priceBdt: s.premiumPriceBdt,
      period: "day",
      featuresBn: [
        "ফ্রি প্ল্যানের সব কিছু",
        `দিনে ${toBnDigits(p.aiSearchPerDay)}টি AI সার্চ`,
        `দিনে ${toBnDigits(p.resumeTailorPerDay)}টি AI রিজিউমে সাজানো`,
        "নতুন মিলের তাৎক্ষণিক অ্যালার্ট",
      ],
      quotas: { ai_search: p.aiSearchPerDay, resume_tailor: p.resumeTailorPerDay, cv_parse: p.cvParsePerDay },
    },
  ];
}

export async function getPlans(ctx: Ctx, db: DbOrTx): Promise<Plan[]> {
  authorize(ctx.actor, "circular.browse");
  return plansFrom(await readSettings(db));
}

async function subscriptionRow(db: DbOrTx, userId: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  if (row) return row;
  const [created] = await db.insert(subscriptions).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)))[0];
}

export async function getBilling(ctx: Ctx, db: DbOrTx): Promise<Billing> {
  const userId = requireUser(ctx.actor);
  const now = ctx.now();
  const [settings, sub] = await Promise.all([readSettings(db), subscriptionRow(db, userId)]);
  const plans = plansFrom(settings);
  const active = (sub.status === "trialing" || sub.status === "active") && (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > now);
  const plan = plans.find((p) => p.id === (active ? sub.planId : "free")) ?? plans[0];
  const dayStart = dhakaToUtc(dhakaDateKey(now), "00:00");
  const resetsAt = new Date(dayStart.getTime() + DAY).toISOString();
  const [[ai], [cv], [tailor]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(searchLogs)
      .where(and(eq(searchLogs.userId, userId), gte(searchLogs.createdAt, dayStart), inArray(searchLogs.mode, ["ai", "ai_fallback"]))),
    db.select({ n: sql<number>`count(*)::int` }).from(cvParseJobs).where(and(eq(cvParseJobs.userId, userId), gte(cvParseJobs.createdAt, dayStart))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(resumes)
      .where(and(eq(resumes.userId, userId), isNotNull(resumes.circularPostId), gte(resumes.updatedAt, dayStart))),
  ]);
  return {
    plans,
    subscription: {
      planId: active ? (sub.planId as "free" | "premium") : "free",
      status: active ? sub.status : sub.status === "none" ? "none" : "expired",
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      trialUsed: sub.trialUsed,
    },
    usage: [
      { feature: "ai_search", used: Number(ai.n), limit: plan.quotas.ai_search, resetsAt },
      { feature: "resume_tailor", used: Number(tailor.n), limit: plan.quotas.resume_tailor, resetsAt },
      { feature: "cv_parse", used: Number(cv.n), limit: plan.quotas.cv_parse, resetsAt },
    ],
  };
}

/** 7-day trial, once per account. */
export async function startTrial(ctx: Ctx, tx: Tx): Promise<Billing> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const sub = await subscriptionRow(tx, userId);
  if (sub.trialUsed) throw new AppError("DUPLICATE", { message_bn: "ট্রায়াল আগেই ব্যবহার করা হয়েছে" });
  const end = new Date(ctx.now() + 7 * DAY);
  await tx
    .update(subscriptions)
    .set({ planId: "premium", status: "trialing", trialEndsAt: end, currentPeriodEnd: end, cancelAtPeriodEnd: false, trialUsed: true, updatedAt: new Date(ctx.now()) })
    .where(eq(subscriptions.userId, userId));
  return getBilling(ctx, tx);
}

/**
 * The clearly-labelled test checkout (Part 1 UI). The real payment provider arrives in Part 3;
 * this only records the outcome the tester picked.
 */
export async function completeMockCheckout(ctx: Ctx, tx: Tx, outcome: "success" | "fail"): Promise<Billing> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  if (outcome === "fail") throw new AppError("UNKNOWN", { message_bn: t("billing.failedToast") });
  await subscriptionRow(tx, userId);
  await tx
    .update(subscriptions)
    .set({ planId: "premium", status: "active", currentPeriodEnd: new Date(ctx.now() + 30 * DAY), cancelAtPeriodEnd: false, updatedAt: new Date(ctx.now()) })
    .where(eq(subscriptions.userId, userId));
  return getBilling(ctx, tx);
}

export async function setCancelAtPeriodEnd(ctx: Ctx, tx: Tx, cancel: boolean): Promise<Billing> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  await subscriptionRow(tx, userId);
  await tx.update(subscriptions).set({ cancelAtPeriodEnd: cancel, updatedAt: new Date(ctx.now()) }).where(eq(subscriptions.userId, userId));
  return getBilling(ctx, tx);
}
