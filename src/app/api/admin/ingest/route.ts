import { NextResponse, after } from "next/server";
import { assertSameOrigin, errorResponse } from "@/server/api/http";
import { newRequestId } from "@/server/context";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { requestCtx } from "@/server/request";
import { runWorker, startIngest } from "@/server/services/workflows";
import { fetchPdf, MAX_PDF_BYTES } from "@/server/workflow/fetch-pdf";

export const maxDuration = 60;

/**
 * Start a circular-ingestion run from a PDF upload, a PDF URL (SSRF-safe fetch) or pasted text.
 * The same content again returns DUPLICATE with the existing run id. The run starts right
 * away via `after()`; the cron worker picks up anything left.
 */
export async function POST(req: Request) {
  let requestId = newRequestId();
  try {
    assertSameOrigin(req);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_PDF_BYTES + 1024 * 1024) throw new AppError("FILE_TOO_LARGE");
    const ctx = await requestCtx();
    requestId = ctx.requestId;
    const form = await req.formData().catch(() => null);
    if (!form) throw new AppError("VALIDATION");
    const kind = String(form.get("kind") ?? "");
    const failAt = (form.get("failAt") as string | null) || null;
    const db = getDb();
    let r: { runId: string; duplicate: boolean };
    if (kind === "pdf_upload") {
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("VALIDATION", { fields: { file: "PDF দিন" } });
      if (file.size > MAX_PDF_BYTES) throw new AppError("FILE_TOO_LARGE");
      r = await startIngest(ctx, db, { kind, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), failAt });
    } else if (kind === "pdf_url") {
      const url = String(form.get("url") ?? "");
      // Authorize before fetching anything.
      if (ctx.actor.kind !== "user" || (ctx.actor.role !== "admin" && ctx.actor.role !== "moderator")) throw new AppError(ctx.actor.kind === "user" ? "FORBIDDEN" : "UNAUTHENTICATED");
      r = await startIngest(ctx, db, { kind, url, bytes: await fetchPdf(url), failAt });
    } else if (kind === "text") {
      r = await startIngest(ctx, db, { kind, text: String(form.get("text") ?? ""), failAt });
    } else {
      throw new AppError("VALIDATION");
    }
    if (r.duplicate) {
      throw new AppError("DUPLICATE", { message_bn: "এই সার্কুলার আগেই ইনজেস্ট করা হয়েছে", fields: { runId: r.runId } });
    }
    after(() => runWorker(db, { runId: r.runId, limit: 15 }).then(() => undefined));
    return NextResponse.json({ ok: true, data: { runId: r.runId } }, { headers: { "cache-control": "no-store", "x-request-id": requestId } });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
