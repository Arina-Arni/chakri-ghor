import "server-only";
import { and, desc, eq, gt, gte, ne, sql } from "drizzle-orm";
import { integrationEnv } from "@/env";
import { BREAKER_OPEN_MS } from "@/lib/ai/resilience";
import type { AiFeature, AiHealthStats, FaultMode } from "@/types";
import { authorize, requireUser } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import type { Ctx } from "@/server/context";
import type { DbOrTx, Tx } from "@/server/db/client";
import { aiCalls, circuitBreakers, faultInjections } from "@/server/db/schema";
import { AppError } from "@/server/errors";

export const AI_FEATURES: AiFeature[] = ["search_parse", "cv_parse", "resume_tailor", "circular_extract", "tagging"];
const FAULT_TTL_MS = 15 * 60_000;

async function activeFaultFor(db: DbOrTx, adminId: string, now: number): Promise<AiHealthStats["faultInjection"]> {
  const [row] = await db
    .select()
    .from(faultInjections)
    .where(and(eq(faultInjections.adminId, adminId), gt(faultInjections.expiresAt, new Date(now))))
    .orderBy(desc(faultInjections.createdAt))
    .limit(1);
  return row ? { feature: row.feature as AiFeature, mode: row.mode as FaultMode, expiresAt: row.expiresAt.toISOString() } : null;
}

/** Success %, fallback %, p50/p95 latency per feature, breaker states and the last 50 failures. */
export async function getAiHealth(ctx: Ctx, db: DbOrTx, period: "24h" | "7d"): Promise<AiHealthStats> {
  authorize(ctx.actor, "admin.dashboard");
  const now = ctx.now();
  const since = new Date(now - (period === "24h" ? 1 : 7) * 86_400_000);
  const [agg, breakers, failures, fault] = await Promise.all([
    db
      .select({
        feature: aiCalls.feature,
        calls: sql<number>`count(*)::int`,
        ok: sql<number>`count(*) filter (where ${aiCalls.outcome} = 'success')::int`,
        p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${aiCalls.latencyMs}), 0)::float8`,
        p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${aiCalls.latencyMs}), 0)::float8`,
      })
      .from(aiCalls)
      .where(gte(aiCalls.createdAt, since))
      .groupBy(aiCalls.feature),
    db.select().from(circuitBreakers),
    db.select().from(aiCalls).where(and(gte(aiCalls.createdAt, since), ne(aiCalls.outcome, "success"))).orderBy(desc(aiCalls.createdAt)).limit(50),
    ctx.actor.kind === "user" ? activeFaultFor(db, ctx.actor.userId, now) : Promise.resolve(null),
  ]);
  const by = new Map(agg.map((a) => [a.feature, a]));
  return {
    period,
    features: AI_FEATURES.map((feature) => {
      const a = by.get(feature);
      const b = breakers.find((x) => x.name === feature);
      const calls = Number(a?.calls ?? 0);
      const ok = Number(a?.ok ?? 0);
      return {
        feature,
        calls,
        successPct: calls ? Math.round((ok / calls) * 1000) / 10 : 100,
        fallbackPct: calls ? Math.round(((calls - ok) / calls) * 1000) / 10 : 0,
        p50Ms: Math.round(Number(a?.p50 ?? 0)),
        p95Ms: Math.round(Number(a?.p95 ?? 0)),
        breaker: { state: b?.state ?? "closed", reopensAt: b?.state === "open" && b.openedAt ? new Date(b.openedAt.getTime() + BREAKER_OPEN_MS).toISOString() : null },
      };
    }),
    failures: failures.map((f) => ({
      id: f.id,
      at: f.createdAt.toISOString(),
      feature: f.feature as AiFeature,
      outcome: f.outcome,
      attempts: f.attempts,
      latencyMs: f.latencyMs,
      message: f.errorMessage ?? "",
    })),
    faultInjection: fault,
    faultInjectionAllowed: integrationEnv().FAULT_INJECTION_ALLOWED && ctx.actor.kind === "user" && ctx.actor.role === "admin",
  };
}

export async function getFaultInjection(ctx: Ctx, db: DbOrTx): Promise<AiHealthStats["faultInjection"]> {
  if (ctx.actor.kind !== "user" || ctx.actor.role !== "admin") return null;
  return activeFaultFor(db, ctx.actor.userId, ctx.now());
}

/**
 * Scoped fault injection (judges' live test): admin-only, only when FAULT_INJECTION_ALLOWED,
 * affects only this admin's own requests, expires after 15 minutes, audit-logged.
 */
export async function setFaultInjection(ctx: Ctx, tx: Tx, feature: AiFeature | null, mode: FaultMode | null, allowed = integrationEnv().FAULT_INJECTION_ALLOWED): Promise<AiHealthStats["faultInjection"]> {
  const adminId = requireUser(ctx.actor, "settings.manage", { mutation: true });
  if (!allowed) throw new AppError("FORBIDDEN", { message_bn: "এই সার্ভারে ফল্ট ইনজেকশন বন্ধ আছে।" });
  const now = ctx.now();
  await tx.update(faultInjections).set({ expiresAt: new Date(now) }).where(and(eq(faultInjections.adminId, adminId), gt(faultInjections.expiresAt, new Date(now))));
  if (feature && mode) {
    await tx.insert(faultInjections).values({ adminId, feature, mode, expiresAt: new Date(now + FAULT_TTL_MS) });
  }
  await writeAudit(tx, ctx, { action: "ai.fault_injection", entityType: "settings", entityId: "fault_injection", after: feature && mode ? { feature, mode, minutes: 15 } : { disabled: true } });
  return feature && mode ? { feature, mode, expiresAt: new Date(now + FAULT_TTL_MS).toISOString() } : null;
}
