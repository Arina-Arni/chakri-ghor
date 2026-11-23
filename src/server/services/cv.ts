import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { CV_MAX_BYTES, CV_MAX_PDF_PAGES, pdfLooksEncrypted, sniffCvType, type CvKind } from "@/domain/cv";
import type { CvParseResult } from "@/types";
import { requireUser } from "@/server/authz";
import type { Ctx } from "@/server/context";
import type { DbOrTx } from "@/server/db/client";
import { cvParseJobs, profiles } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { aiParseCv } from "@/server/ai/features";
import { consumeQuota } from "@/server/quota";

const REUSE_MS = 24 * 60 * 60 * 1000;
const MIME: Record<CvKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Text from the file, in memory only. Throws typed errors for the UI states. */
async function extractText(kind: CvKind, bytes: Uint8Array): Promise<string> {
  if (kind === "txt") return new TextDecoder("utf-8").decode(bytes);
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return r.value;
  }
  if (pdfLooksEncrypted(bytes)) throw new AppError("FILE_ENCRYPTED");
  const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (e) {
    if (/password/i.test(String((e as Error)?.message ?? e))) throw new AppError("FILE_ENCRYPTED");
    throw new AppError("CV_UNREADABLE");
  }
  if (pdf.numPages > CV_MAX_PDF_PAGES) {
    throw new AppError("VALIDATION", { message_bn: `সিভি সর্বোচ্চ ${CV_MAX_PDF_PAGES} পৃষ্ঠার হতে পারে।` });
  }
  const { text } = await pdfText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

/**
 * CV upload (spec §5.3): consent required; type by magic bytes; ≤ 5 MB; encrypted PDFs
 * detected; text extracted in memory and regex-parsed; same file within 24 h reuses the
 * earlier result. A cv_parse_jobs row records every outcome. The file is never stored.
 */
export async function parseCv(
  ctx: Ctx,
  db: DbOrTx,
  file: { name: string; bytes: Uint8Array },
  consent: boolean,
): Promise<CvParseResult> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  if (!consent) throw new AppError("VALIDATION", { message_bn: "আপলোডের আগে সম্মতি দিন", fields: { consent: "আপলোডের আগে সম্মতি দিন" } });
  if (file.bytes.length === 0) throw new AppError("CV_UNREADABLE");
  if (file.bytes.length > CV_MAX_BYTES) throw new AppError("FILE_TOO_LARGE");
  const kind = sniffCvType(file.bytes, file.name);
  if (!kind) throw new AppError("FILE_TYPE");

  await db.update(profiles).set({ aiConsentAt: new Date(ctx.now()) }).where(eq(profiles.userId, userId));

  const sha = await sha256Hex(file.bytes);
  const [previous] = await db
    .select()
    .from(cvParseJobs)
    .where(
      and(
        eq(cvParseJobs.userId, userId),
        eq(cvParseJobs.fileSha256, sha),
        inArray(cvParseJobs.status, ["succeeded", "fallback"]),
        gte(cvParseJobs.createdAt, new Date(ctx.now() - REUSE_MS)),
      ),
    )
    .orderBy(desc(cvParseJobs.createdAt))
    .limit(1);
  if (previous?.result) return previous.result as CvParseResult;

  // Same file within 24 h was answered above for free; a new parse counts against the quota.
  await consumeQuota(ctx, db, "cv_parse");
  const [job] = await db
    .insert(cvParseJobs)
    .values({ userId, fileSha256: sha, mime: MIME[kind], sizeBytes: file.bytes.length, status: "processing" })
    .returning({ id: cvParseJobs.id });
  try {
    const text = await extractText(kind, file.bytes);
    const scanned = text.replace(/\s/g, "").length < 50;
    if (scanned && kind !== "pdf") throw new AppError("CV_UNREADABLE");
    // AI path (A06) with the regex extraction as its fallback; scanned PDFs go to Gemini vision.
    const { result, mode } = await aiParseCv(ctx, { text, sha256: sha, pdfBase64: scanned ? Buffer.from(file.bytes).toString("base64") : null });
    if (scanned && result.status === "partial" && Object.keys(result.extracted).length === 0) throw new AppError("CV_UNREADABLE");
    await db.update(cvParseJobs).set({ status: mode === "ai" ? "succeeded" : "fallback", result, updatedAt: new Date() }).where(eq(cvParseJobs.id, job.id));
    return result;
  } catch (e) {
    const code = e instanceof AppError ? e.code : "CV_UNREADABLE";
    await db.update(cvParseJobs).set({ status: "failed", errorCode: code, updatedAt: new Date() }).where(eq(cvParseJobs.id, job.id));
    throw e instanceof AppError ? e : new AppError("CV_UNREADABLE");
  }
}
