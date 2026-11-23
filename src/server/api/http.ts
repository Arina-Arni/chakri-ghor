import "server-only";
import { NextResponse } from "next/server";
import { AppError, HTTP_STATUS, failure } from "@/server/errors";

/** Route Handlers verify Origin themselves (Server Actions get this check from Next.js). */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) {
    if (req.headers.get("sec-fetch-site") === "same-origin") return;
    throw new AppError("FORBIDDEN");
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    ok = new URL(origin).host === host;
  } catch {
    ok = false;
  }
  if (!ok) throw new AppError("FORBIDDEN");
}

export function errorResponse(e: unknown, requestId: string): NextResponse {
  const r = failure(e, requestId);
  const status = r.ok ? 200 : (HTTP_STATUS[r.error.code as keyof typeof HTTP_STATUS] ?? 500);
  return NextResponse.json(r, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } });
}
