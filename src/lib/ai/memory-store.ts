import { CLOSED, breakerDecision, breakerOnFailure, breakerOnSuccess } from "./resilience";
import type { AiCallLog, AiFeature, AiStore, BreakerRecord, FaultMode } from "./types";

/** In-memory AiStore for unit tests and local scripts. */
export class MemoryAiStore implements AiStore {
  breakers = new Map<string, BreakerRecord>();
  cache = new Map<string, { value: unknown; expiresAt: number }>();
  logs: AiCallLog[] = [];
  faults = new Map<string, FaultMode>();
  minute = { start: 0, count: 0 };

  async breakerAcquire(name: string, now: number) {
    const { decision, next } = breakerDecision(this.breakers.get(name) ?? CLOSED, now);
    this.breakers.set(name, next);
    return decision;
  }
  async breakerSuccess(name: string) {
    this.breakers.set(name, breakerOnSuccess());
  }
  async breakerFailure(name: string, now: number) {
    this.breakers.set(name, breakerOnFailure(this.breakers.get(name) ?? CLOSED, now));
  }
  async cacheGet(key: string, now: number, allowStale: boolean) {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    return hit.expiresAt > now || allowStale ? hit.value : undefined;
  }
  async cacheSet(key: string, value: unknown, expiresAt: number) {
    this.cache.set(key, { value, expiresAt });
  }
  async globalTick(now: number) {
    const start = Math.floor(now / 60_000) * 60_000;
    if (this.minute.start !== start) this.minute = { start, count: 0 };
    return ++this.minute.count;
  }
  async activeFault(actorId: string | null, feature: AiFeature) {
    return actorId ? (this.faults.get(`${actorId}:${feature}`) ?? null) : null;
  }
  async log(entry: AiCallLog) {
    this.logs.push(entry);
  }
}
