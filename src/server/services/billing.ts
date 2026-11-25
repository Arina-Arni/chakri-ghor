import "server-only";
import { eq, sql } from "drizzle-orm";
import { toBnDigits } from "@/domain/bn";
import { applyPayment, advance, setCancel, startTrial as trialMove, type SubState } from "@/domain/state-machines/subscription";
import { t } from "@/i18n";
import type { Billing, Plan } from "@/types";
import { authorize, requireUser } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import type { Ctx } from "@/server/context";
import { getDb, type DbOrTx, type Tx } from "@/server/db/client";
import { payments, plans, subscriptions } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { MockPaymentProvider, paymentProvider, type PaymentEvent } from "@/server/payments/provider";
import { DEFAULT_PLANS, dayWindow, subStateOf, usedToday } from "@/server/quota";

const DAY = 86_400_000;

async function planRows(db: DbOrTx) {
  const rows = await db.select().from(plans);
  return DEFAULT_PLANS.map((d) => {
    const r = rows.find((x) => x.code === d.code);
    return r ? { ...d, nameBn: r.nameBn, priceBdt: r.priceBdt, billingPeriod: r.billingPeriod as "daily" | "monthly", quotas: r.quotas, featuresBn: r.featuresBn.length ? r.featuresBn : d.featuresBn } : d;
  });
}

function toPlan(p: Awaited<ReturnType<typeof planRows>>[number]): Plan {
  const features =
    p.code === "premium"
      ? [p.featuresBn[0], `দিনে ${toBnDigits(p.quotas.ai_search_per_day)}টি AI সার্চ`, `দিনে ${toBnDigits(p.quotas.tailored_resume_per_day)}টি AI রিজিউমে সাজানো`, ...p.featuresBn.slice(3)]
      : p.featuresBn;
  return {
    id: p.code,
    nameBn: p.nameBn,
    priceBdt: p.priceBdt,
    period: p.billingPeriod === "monthly" ? "month" : "day",
    featuresBn: features.filter(Boolean),
    quotas: { ai_search: p.quotas.ai_search_per_day, resume_tailor: p.quotas.tailored_resume_per_day, cv_parse: p.quotas.cv_parse_per_day },
  };
}

export async function getPlans(ctx: Ctx, db: DbOrTx): Promise<Plan[]> {
  authorize(ctx.actor, "circular.browse");
  return (await planRows(db)).map(toPlan);
}

async function subRow(db: DbOrTx, userId: string, lock = false) {
  await db.insert(subscriptions).values({ userId }).onConflictDoNothing();
  const q = db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  const [row] = lock ? await q.for("update") : await q;
  return row;
}

async function saveState(tx: DbOrTx, userId: string, s: SubState, extra: Partial<typeof subscriptions.$inferInsert> = {}) {
  await tx
    .update(subscriptions)
    .set({
      status: s.status,
      planId: s.planCode,
      trialEndsAt: s.trialEndsAt != null ? new Date(s.trialEndsAt) : null,
      currentPeriodStart: s.currentPeriodStart != null ? new Date(s.currentPeriodStart) : null,
      currentPeriodEnd: s.currentPeriodEnd != null ? new Date(s.currentPeriodEnd) : null,
      graceEndsAt: s.graceEndsAt != null ? new Date(s.graceEndsAt) : null,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      trialUsed: s.trialUsed,
      version: sql`${subscriptions.version} + 1`,
      updatedAt: new Date(),
      ...extra,
    })
    .where(eq(subscriptions.userId, userId));
}

export async function getBilling(ctx: Ctx, db: DbOrTx): Promise<Billing> {
  const userId = requireUser(ctx.actor);
  const now = ctx.now();
  // All five reads are independent: one round trip instead of two.
  const [ps, row, ai, cv, tailor] = await Promise.all([
    planRows(db),
    subRow(db, userId),
    usedToday(db, userId, "ai_search", now),
    usedToday(db, userId, "cv_parse", now),
    usedToday(db, userId, "resume_tailor", now),
  ]);
  const s = advance(subStateOf(row), now);
  const premium = s.status === "trialing" || s.status === "active" || s.status === "past_due" || s.status === "grace";
  const plan = ps.find((p) => p.code === (premium ? "premium" : "free"))!;
  const resetsAt = dayWindow(now).resetsAt.toISOString();
  return {
    plans: ps.map(toPlan),
    subscription: {
      planId: premium ? "premium" : "free",
      status: s.status,
      trialEndsAt: s.trialEndsAt != null ? new Date(s.trialEndsAt).toISOString() : null,
      currentPeriodEnd: (s.status === "grace" ? s.graceEndsAt : s.currentPeriodEnd) != null ? new Date((s.status === "grace" ? s.graceEndsAt : s.currentPeriodEnd)!).toISOString() : null,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      trialUsed: s.trialUsed,
    },
    usage: [
      { feature: "ai_search", used: Math.min(ai, plan.quotas.ai_search_per_day), limit: plan.quotas.ai_search_per_day, resetsAt },
      { feature: "resume_tailor", used: Math.min(tailor, plan.quotas.tailored_resume_per_day), limit: plan.quotas.tailored_resume_per_day, resetsAt },
      { feature: "cv_parse", used: Math.min(cv, plan.quotas.cv_parse_per_day), limit: plan.quotas.cv_parse_per_day, resetsAt },
    ],
  };
}

/** 7-day trial, once per account. */
export async function startTrial(ctx: Ctx, tx: Tx): Promise<Billing> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const row = await subRow(tx, userId, true);
  const r = trialMove(advance(subStateOf(row), ctx.now()), ctx.now());
  if (!r.ok) throw new AppError(r.reasonCode === "TRIAL_USED" ? "DUPLICATE" : "ILLEGAL_TRANSITION", { message_bn: r.message_bn });
  await saveState(tx, userId, r.state);
  return getBilling(ctx, tx);
}

export async function setCancelAtPeriodEnd(ctx: Ctx, tx: Tx, cancel: boolean): Promise<Billing> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const row = await subRow(tx, userId, true);
  const r = setCancel(advance(subStateOf(row), ctx.now()), cancel);
  if (!r.ok) throw new AppError("ILLEGAL_TRANSITION", { message_bn: r.message_bn });
  await saveState(tx, userId, r.state);
  return getBilling(ctx, tx);
}

function secret(): string {
  const s = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!s || s.length < 16) throw new AppError("UNKNOWN", { message_bn: "পেমেন্ট কনফিগার করা হয়নি।" });
  return s;
}

/**
 * Apply a verified payment event exactly once (unique provider_txn_id and idempotency key):
 * a duplicate webhook changes nothing and never extends a period twice.
 */
export async function applyPaymentEvent(tx: Tx, e: PaymentEvent, provider: string, now: number): Promise<{ applied: boolean }> {
  const row = await subRow(tx, e.userId, true);
  if (!row) throw new AppError("NOT_FOUND");
  const inserted = await tx
    .insert(payments)
    .values({ subscriptionId: e.userId, amountBdt: e.amountBdt, status: e.status, provider, providerTxnId: e.txnId, idempotencyKey: `${provider}:${e.txnId}`, raw: e.raw })
    .onConflictDoNothing()
    .returning({ id: payments.id });
  if (inserted.length === 0 || e.status !== "succeeded") return { applied: false };
  const r = applyPayment(advance(subStateOf(row), now), now, e.periodDays * DAY);
  if (!r.ok) return { applied: false };
  await saveState(tx, e.userId, r.state, { provider, providerRef: e.txnId });
  return { applied: true };
}

/** Webhook endpoint body: verify signature, parse, apply once. */
export async function handlePaymentWebhook(rawBody: string, signature: string | null, now = Date.now()): Promise<{ applied: boolean }> {
  const provider = paymentProvider(secret());
  if (!provider.verifyWebhook(rawBody, signature)) throw new AppError("FORBIDDEN", { message_bn: "ওয়েবহুক যাচাই হয়নি।" });
  let event: PaymentEvent;
  try {
    event = provider.parseEvent(rawBody);
  } catch {
    throw new AppError("VALIDATION");
  }
  return getDb().transaction((tx) => applyPaymentEvent(tx, event, provider.name, now));
}

/**
 * The clearly-labelled test checkout: the user picks success or failure; the mock gateway
 * then delivers a signed webhook through the same verification path a real provider uses.
 */
export async function completeMockCheckout(ctx: Ctx, outcome: "success" | "fail", sessionKey: string): Promise<Billing> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const plan = (await planRows(getDb())).find((p) => p.code === "premium")!;
  const provider = new MockPaymentProvider(secret());
  const { body, signature } = provider.buildWebhook({
    txnId: `mock-${sessionKey}`,
    status: outcome === "success" ? "succeeded" : "failed",
    amountBdt: plan.priceBdt * (plan.billingPeriod === "monthly" ? 1 : 30),
    userId,
    periodDays: 30,
  });
  await handlePaymentWebhook(body, signature, ctx.now());
  if (outcome === "fail") throw new AppError("UNKNOWN", { message_bn: t("billing.failedToast") });
  await getDb().transaction((tx) => writeAudit(tx, ctx, { action: "billing.payment", entityType: "account", entityId: userId, after: { provider: "mock", txn: `mock-${sessionKey}` } }));
  return getBilling(ctx, getDb());
}
