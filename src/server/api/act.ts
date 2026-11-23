import "server-only";
import type { Result } from "@/types";
import { newRequestId, type Ctx } from "@/server/context";
import type { Tx } from "@/server/db/client";
import { failure } from "@/server/errors";
import { runIdempotent } from "@/server/idempotency";
import { requestCtx } from "@/server/request";

/**
 * Wrap one Server Action: build the request context on the server, run the mutation inside
 * an idempotent transaction, and return the `Result` shape the UI expects. Nothing thrown
 * ever reaches the client — only `{ code, message_bn, fields?, requestId }`.
 */
export async function act<T>(name: string, key: string, input: unknown, fn: (ctx: Ctx, tx: Tx) => Promise<T>): Promise<Result<T>> {
  let requestId = newRequestId();
  try {
    const ctx = await requestCtx();
    requestId = ctx.requestId;
    const data = await runIdempotent(ctx, name, key, input, (tx) => fn(ctx, tx));
    return { ok: true, data };
  } catch (e) {
    return failure<T>(e, requestId);
  }
}

/** For actions that change no rows of ours (Supabase Auth calls). */
export async function actDirect<T>(fn: (ctx: Ctx) => Promise<T>): Promise<Result<T>> {
  let requestId = newRequestId();
  try {
    const ctx = await requestCtx();
    requestId = ctx.requestId;
    return { ok: true, data: await fn(ctx) };
  } catch (e) {
    return failure<T>(e, requestId);
  }
}
