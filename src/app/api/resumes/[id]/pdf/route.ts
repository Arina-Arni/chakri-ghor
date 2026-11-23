import { errorResponse } from "@/server/api/http";
import { newRequestId } from "@/server/context";
import { getDb } from "@/server/db/client";
import { renderResumePdf } from "@/server/pdf/resume-pdf";
import { requestCtx } from "@/server/request";
import { resumeForPdf } from "@/server/services/resumes";

/** English, single-column ATS PDF of one of the caller's resumes (someone else's → 404). */
export async function GET(_req: Request, ctxArg: RouteContext<"/api/resumes/[id]/pdf">) {
  const { id } = await ctxArg.params;
  let requestId = newRequestId();
  try {
    const ctx = await requestCtx();
    requestId = ctx.requestId;
    const { title, content } = await resumeForPdf(ctx, getDb(), id);
    const pdf = await renderResumePdf(content, title);
    const base = `${content.contact.fullName || "resume"}_${title}`.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80) || "resume";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${base}.pdf"`,
        "cache-control": "private, no-store",
        "x-request-id": requestId,
      },
    });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
