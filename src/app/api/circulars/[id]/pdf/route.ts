import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { errorResponse } from "@/server/api/http";
import { isStaff, newRequestId } from "@/server/context";
import { getDb } from "@/server/db/client";
import { circulars } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { requestCtx } from "@/server/request";
import { signedPdfUrl } from "@/server/supabase";

/** Notice PDF: private bucket, redirected through a signed URL valid for ≤ 5 minutes. */
export async function GET(_req: Request, ctxArg: RouteContext<"/api/circulars/[id]/pdf">) {
  const { id } = await ctxArg.params;
  let requestId = newRequestId();
  try {
    const ctx = await requestCtx();
    requestId = ctx.requestId;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("NOT_FOUND");
    const visible = isStaff(ctx.actor) ? undefined : sql`${circulars.status} in ('published','closed')`;
    const [row] = await getDb()
      .select({ path: circulars.pdfPath })
      .from(circulars)
      .where(and(eq(circulars.id, id), sql`${circulars.deletedAt} is null`, visible));
    if (!row?.path) throw new AppError("NOT_FOUND");
    const url = await signedPdfUrl(row.path, 300);
    if (!url) throw new AppError("NOT_FOUND");
    return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
