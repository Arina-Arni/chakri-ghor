import { NextResponse } from "next/server";
import { READS, parseReadArgs } from "@/server/api/reads";
import { newRequestId } from "@/server/context";
import { getDb } from "@/server/db/client";
import { AppError, HTTP_STATUS, failure } from "@/server/errors";
import { requestCtx } from "@/server/request";

/** Route Handlers check Origin themselves (Server Actions get this from Next.js). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Read endpoint for the client data layer: POST /api/q/<name> with `{ args: [...] }`.
 * Reads go through a Route Handler (not Server Actions) so screens can load in parallel.
 */
export async function POST(req: Request, ctxArg: RouteContext<"/api/q/[name]">) {
  const { name } = await ctxArg.params;
  let requestId = newRequestId();
  try {
    if (!sameOrigin(req)) throw new AppError("FORBIDDEN");
    if (!Object.hasOwn(READS, name)) throw new AppError("NOT_FOUND");
    const body = (await req.json().catch(() => null)) as { args?: unknown } | null;
    const args = parseReadArgs(name, body?.args);
    const ctx = await requestCtx();
    requestId = ctx.requestId;
    const data = await READS[name].run(ctx, getDb(), args as never[]);
    return NextResponse.json({ ok: true, data }, { headers: { "cache-control": "no-store", "x-request-id": requestId } });
  } catch (e) {
    const result = failure(e, requestId);
    const status = result.ok ? 200 : HTTP_STATUS[result.error.code as keyof typeof HTTP_STATUS] ?? 500;
    return NextResponse.json(result, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } });
  }
}
