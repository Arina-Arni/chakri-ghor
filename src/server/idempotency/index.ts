import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/server/db/client";
import { idempotencyKeys } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import type { Ctx } from "@/server/context";

const NIL_USER = "00000000-0000-0000-0000-000000000000";
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_RE = /^[A-Za-z0-9_:.-]{8,120}$/;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable JSON (sorted keys) so the same input always hashes the same. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

/**
 * Run a mutation exactly once per idempotency key (spec §6).
 *
 * The key row and the mutation share one transaction: a concurrent duplicate waits on the
 * unique index, then reads the stored response; if the mutation fails, everything (including
 * the key) rolls back so the same key can be retried. A key reused with a different payload
 * is rejected. Keys expire after 24 h.
 */
export async function runIdempotent<T>(
  ctx: Ctx,
  action: string,
  key: string,
  input: unknown,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!KEY_RE.test(key)) throw new AppError("VALIDATION", { message_bn: "অনুরোধের আইডি ঠিক নেই।" });
  const userId = ctx.actor.kind === "user" ? ctx.actor.userId : NIL_USER;
  const requestHash = await sha256(`${action}\n${stableStringify(input)}`);
  const db = getDb();

  // Expired keys can be reused.
  await db
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.key, key),
        lt(idempotencyKeys.createdAt, new Date(ctx.now() - IDEMPOTENCY_TTL_MS)),
      ),
    );

  type Replay = { replay: true; response: T } | { replay: false; value: T };
  const out = await db.transaction(async (tx): Promise<Replay> => {
    const inserted = await tx
      .insert(idempotencyKeys)
      .values({ key, userId, action, requestHash, status: "in_progress" })
      .onConflictDoNothing({ target: [idempotencyKeys.userId, idempotencyKeys.key] })
      .returning({ id: idempotencyKeys.id });

    if (inserted.length === 0) {
      const [row] = await tx
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
      if (!row) throw new AppError("CONFLICT");
      if (row.action !== action || row.requestHash !== requestHash) {
        throw new AppError("VALIDATION", { message_bn: "একই অনুরোধ-আইডি ভিন্ন তথ্যের সাথে ব্যবহার করা হয়েছে।" });
      }
      if (row.status !== "completed") {
        throw new AppError("CONFLICT", { message_bn: "আগের অনুরোধটি এখনো চলছে। একটু পরে আবার চেষ্টা করুন।" });
      }
      return { replay: true, response: row.response as T };
    }

    const value = await fn(tx);
    await tx
      .update(idempotencyKeys)
      .set({ status: "completed", response: sql`${JSON.stringify(value ?? null)}::jsonb` })
      .where(eq(idempotencyKeys.id, inserted[0].id));
    return { replay: false, value };
  });
  return out.replay ? out.response : out.value;
}
