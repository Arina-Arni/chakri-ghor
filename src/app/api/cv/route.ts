import { NextResponse } from "next/server";
import { CV_MAX_BYTES } from "@/domain/cv";
import { assertSameOrigin, errorResponse } from "@/server/api/http";
import { newRequestId } from "@/server/context";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { requestCtx } from "@/server/request";
import { parseCv } from "@/server/services/cv";

/** CV upload: multipart `file` + `consent=true`. The file is parsed in memory and never stored. */
export async function POST(req: Request) {
  let requestId = newRequestId();
  try {
    assertSameOrigin(req);
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > CV_MAX_BYTES + 64 * 1024) throw new AppError("FILE_TOO_LARGE");
    const ctx = await requestCtx();
    requestId = ctx.requestId;
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", { fields: { file: "ফাইল দিন" } });
    if (file.size > CV_MAX_BYTES) throw new AppError("FILE_TOO_LARGE");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await parseCv(ctx, getDb(), { name: file.name.slice(0, 200), bytes }, form?.get("consent") === "true");
    return NextResponse.json({ ok: true, data: result }, { headers: { "cache-control": "no-store", "x-request-id": requestId } });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
