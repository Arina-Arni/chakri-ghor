import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { CLOSED, breakerDecision, breakerOnFailure, breakerOnSuccess } from "@/lib/ai/resilience";
import type { AiCallLog, AiFeature, AiStore, BreakerRecord, FaultMode } from "@/lib/ai/types";
import { getDb } from "@/server/db/client";
import { aiCache, aiCalls, circuitBreakers, faultInjections, usageCounters } from "@/server/db/schema";

const toRecord = (r: typeof circuitBreakers.$inferSelect): BreakerRecord => ({
  state: r.state,
  failureCount: r.failureCount,
  windowStartedAt: r.windowStartedAt?.getTime() ?? null,
  openedAt: r.openedAt?.getTime() ?? null,
});

const fromRecord = (b: BreakerRecord) => ({
  state: b.state,
  failureCount: b.failureCount,
  windowStartedAt: b.windowStartedAt != null ? new Date(b.windowStartedAt) : null,
  openedAt: b.openedAt != null ? new Date(b.openedAt) : null,
  updatedAt: new Date(),
});

/**
 * Postgres-backed AiStore. Breaker state lives in `circuit_breakers` and is changed under a
 * row lock, so concurrent serverless instances agree on it and only one gets the half-open probe.
 */
export class DbAiStore implements AiStore {
  private async withBreaker(name: string, fn: (b: BreakerRecord) => { next: BreakerRecord; result?: "allow" | "probe" | "reject" }) {
    return getDb().transaction(async (tx) => {
      await tx.insert(circuitBreakers).values({ name }).onConflictDoNothing();
      const [row] = await tx.select().from(circuitBreakers).where(eq(circuitBreakers.name, name)).for("update");
      const current = row ? toRecord(row) : CLOSED;
      const { next, result } = fn(current);
      if (JSON.stringify(next) !== JSON.stringify(current)) await tx.update(circuitBreakers).set(fromRecord(next)).where(eq(circuitBreakers.name, name));
      return result;
    });
  }

  async breakerAcquire(name: string, now: number) {
    return (await this.withBreaker(name, (b) => {
      const d = breakerDecision(b, now);
      return { next: d.next, result: d.decision };
    }))!;
  }
  async breakerSuccess(name: string) {
    await this.withBreaker(name, () => ({ next: breakerOnSuccess() }));
  }
  async breakerFailure(name: string, now: number) {
    await this.withBreaker(name, (b) => ({ next: breakerOnFailure(b, now) }));
  }

  async cacheGet(key: string, now: number, allowStale: boolean) {
    const [row] = await getDb()
      .select()
      .from(aiCache)
      .where(and(eq(aiCache.key, key), allowStale ? undefined : gt(aiCache.expiresAt, new Date(now))));
    return row?.value;
  }
  async cacheSet(key: string, value: unknown, expiresAt: number) {
    await getDb()
      .insert(aiCache)
      .values({ key, value: value as object, expiresAt: new Date(expiresAt) })
      .onConflictDoUpdate({ target: aiCache.key, set: { value: value as object, expiresAt: new Date(expiresAt) } });
  }

  async globalTick(now: number) {
    const windowStart = new Date(Math.floor(now / 60_000) * 60_000);
    const [row] = await getDb()
      .insert(usageCounters)
      .values({ subject: "global", feature: "ai_provider", windowStart, count: 1 })
      .onConflictDoUpdate({ target: [usageCounters.subject, usageCounters.feature, usageCounters.windowStart], set: { count: sql`${usageCounters.count} + 1` } })
      .returning({ count: usageCounters.count });
    return row.count;
  }

  async activeFault(actorId: string | null, feature: AiFeature, now: number): Promise<FaultMode | null> {
    if (!actorId) return null;
    const [row] = await getDb()
      .select({ mode: faultInjections.mode })
      .from(faultInjections)
      .where(and(eq(faultInjections.adminId, actorId), eq(faultInjections.feature, feature), gt(faultInjections.expiresAt, new Date(now))))
      .orderBy(desc(faultInjections.createdAt))
      .limit(1);
    return (row?.mode as FaultMode | undefined) ?? null;
  }

  async log(e: AiCallLog) {
    await getDb().insert(aiCalls).values({
      feature: e.feature,
      userId: e.userId,
      model: e.model,
      outcome: e.outcome,
      attempts: e.attempts,
      latencyMs: Math.max(0, Math.round(e.latencyMs)),
      inputTokens: e.inputTokens ?? null,
      outputTokens: e.outputTokens ?? null,
      errorMessage: e.errorMessage?.slice(0, 500) ?? null,
      requestId: e.requestId,
    });
  }
}
