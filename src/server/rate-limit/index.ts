import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { rateLimits } from "@/server/db/schema";
import { AppError } from "@/server/errors";

export type LimitRule = { limit: number; windowSec: number };

/** Auth endpoints, on top of Supabase's own limits. */
export const AUTH_LIMITS = {
  login: { limit: 10, windowSec: 15 * 60 },
  signup: { limit: 5, windowSec: 60 * 60 },
  reset: { limit: 5, windowSec: 60 * 60 },
} satisfies Record<string, LimitRule>;

/**
 * Fixed-window counter in Postgres: one upsert per attempt. Returns seconds to wait when
 * the window is full.
 */
export async function consume(key: string, rule: LimitRule, now = Date.now()): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const windowStart = new Date(now - rule.windowSec * 1000);
  const nowDate = new Date(now);
  const [row] = await getDb()
    .insert(rateLimits)
    .values({ key, windowStart: nowDate, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < ${windowStart.toISOString()}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < ${windowStart.toISOString()}::timestamptz then ${nowDate.toISOString()}::timestamptz else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  if (row.count > rule.limit) {
    const resetAt = row.windowStart.getTime() + rule.windowSec * 1000;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  }
  return { ok: true };
}

/** Check every key (e.g. IP hash and email); throws RATE_LIMITED on the first that is full. */
export async function enforce(keys: string[], rule: LimitRule, now = Date.now()): Promise<void> {
  for (const key of keys) {
    const r = await consume(key, rule, now);
    if (!r.ok) throw new AppError("RATE_LIMITED", { retryAfterSec: r.retryAfterSec });
  }
}
