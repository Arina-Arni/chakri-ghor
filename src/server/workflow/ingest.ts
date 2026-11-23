import "server-only";
/**
 * Circular-ingestion workflow (spec Part 3 §3.2). Every step is idempotent: ids are derived
 * from the run id, writes are upserts, and later steps read earlier steps' persisted outputs.
 */
import { createHash } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { dhakaDateKey } from "@/domain/bn";
import { computeEligibility } from "@/domain/eligibility";
import { extractionSchema, heuristicExtraction, normalizeExtraction, type Extraction, type Flag, type Normalized } from "@/domain/ingest";
import { buildCircularSearchText, circularMatchesFilters } from "@/domain/search-parser";
import { categories, districtById, districts, divisions, tags } from "@/domain/taxonomy";
import { CV_MAX_BYTES } from "@/domain/cv";
import { failed, finish, retry, skipped, succeeded, waiting, type StepContext, type StepResult, type WorkflowDef } from "@/lib/workflow/engine";
import type { Ctx, UserRole } from "@/server/context";
import type { Db } from "@/server/db/client";
import { loadCirculars } from "@/server/db/queries/circulars";
import {
  circularPosts,
  circularTags,
  circulars,
  notificationPreferences,
  notifications,
  organizations,
  preferences,
  profiles,
  savedSearches,
} from "@/server/db/schema";
import { enqueueEmails } from "@/server/email/outbox";
import { aiTag, DATA_ONLY, fence } from "@/server/ai/features";
import { ai } from "@/server/ai/runtime";
import { flagEnabled } from "@/server/services/admin";
import { transitionInTx } from "@/server/services/circulars";
import { loadProfile } from "@/server/services/profile";
import { blobs } from "./blobs";

export const MAX_INGEST_PDF = 15 * 1024 * 1024;
export const AUTO_PUBLISH_CONFIDENCE = 0.85;
export const NOTIFY_BATCH = 200;

export type IngestInput = {
  kind: "pdf_upload" | "pdf_url" | "text";
  label: string;
  sha256: string;
  size: number;
  blobPath?: string;
  text?: string;
  /** Admin-only demo: force this step to fail (spec §3.4). */
  failAt?: string | null;
  /** Tests: notify in smaller batches / fail after N batches to show cursor resume. */
  notifyBatch?: number;
  failAfterBatches?: number | null;
};

/** Stable UUID derived from a name (same run → same circular/post ids on every retry). */
export function derivedId(name: string): string {
  const h = createHash("sha256").update(`chakri-radar:wf:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

/** The person who started the run acts for the run (role re-read from profiles). */
async function runCtx(s: StepContext): Promise<Ctx> {
  const [p] = s.run.createdBy ? await s.db.select({ role: profiles.role, status: profiles.status }).from(profiles).where(eq(profiles.userId, s.run.createdBy)) : [];
  return {
    actor: p ? { kind: "user", userId: s.run.createdBy!, role: p.role as UserRole, status: p.status, email: "" } : { kind: "guest" },
    requestId: `WF-${s.run.id.slice(0, 8)}`,
    ipHash: null,
    userAgent: "workflow",
    visitorKey: `wf:${s.run.id}`,
    now: () => s.now,
  };
}

const input = (s: StepContext) => s.run.input as unknown as IngestInput;
const out = <T>(s: StepContext, step: string) => s.outputs[step] as T;

// ───────── 1. validate_input ─────────

async function validateInput(s: StepContext): Promise<StepResult> {
  const i = input(s);
  if (i.kind === "text") {
    if (!i.text || i.text.trim().length < 50) return failed("INPUT_TOO_SHORT", "টেক্সট অন্তত ৫০ অক্ষরের হতে হবে");
    return succeeded({ kind: "text", sha256: i.sha256, chars: i.text.length });
  }
  const bytes = i.blobPath ? await blobs().get(i.blobPath) : null;
  if (!bytes) return retry("BLOB_MISSING", "সংরক্ষিত PDF পাওয়া যায়নি");
  if (bytes.length > MAX_INGEST_PDF) return failed("FILE_TOO_LARGE", "PDF ১৫ MB-এর বেশি");
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return failed("FILE_TYPE", "ফাইলটি PDF নয়");
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== i.sha256) return failed("HASH_MISMATCH", "ফাইলের hash মেলেনি");
  return succeeded({ kind: "pdf", sha256: sha, size: bytes.length });
}

// ───────── 2. extract_text ─────────

async function extractText(s: StepContext): Promise<StepResult> {
  const i = input(s);
  if (i.kind === "text") return succeeded({ method: "text", text: i.text!.slice(0, 60_000), chars: i.text!.length });
  const bytes = await blobs().get(i.blobPath!);
  if (!bytes) return retry("BLOB_MISSING", "সংরক্ষিত PDF পাওয়া যায়নি");
  const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await pdfText(pdf, { mergePages: true });
    const t = (Array.isArray(text) ? text.join("\n") : text).trim();
    // Scanned (image-only) PDFs go to Gemini as a document in ai_extract.
    return succeeded({ method: t.replace(/\s/g, "").length < 200 ? "vision" : "unpdf", text: t.slice(0, 60_000), chars: t.length, pages: pdf.numPages });
  } catch (e) {
    if (/password/i.test(String((e as Error)?.message))) return failed("FILE_ENCRYPTED", "পাসওয়ার্ড-সুরক্ষিত PDF");
    return failed("PDF_UNREADABLE", "PDF পড়া যায়নি");
  }
}

// ───────── 3. ai_extract ─────────

const EXTRACT_SYSTEM = `You extract a Bangladeshi job circular (নিয়োগ বিজ্ঞপ্তি) into JSON. ${DATA_ONLY}
Dates as YYYY-MM-DD (application_end_at may include a time like "2026-12-15 17:00"). Keep Bangla text in Bangla.
posts[].eligible_districts: district names as written. min_education: one of class_8, ssc, hsc, diploma, bachelor, masters, phd.
field_confidence: 0-1 per top-level field; overall_confidence: 0-1.`;

async function aiExtract(s: StepContext): Promise<StepResult> {
  const text = out<{ text: string; method: string }>(s, "extract_text");
  const i = input(s);
  const ctx = await runCtx(s);
  const pdfBase64 = text.method === "vision" && i.blobPath ? Buffer.from((await blobs().get(i.blobPath))!).toString("base64") : null;
  const r = await ai()<Extraction, null>({
    feature: "circular_extract",
    input: { sha256: i.sha256 },
    prompt: {
      system: EXTRACT_SYSTEM,
      user: pdfBase64 ? "The circular is the attached document." : fence("CIRCULAR", text.text),
      ...(pdfBase64 ? { document: { mimeType: "application/pdf", dataBase64: pdfBase64 } } : {}),
    },
    schema: extractionSchema,
    budgetMs: 45_000,
    retries: 0,
    cacheTtlMs: 7 * 24 * 3600_000,
    hallucinate: (v) => ({ ...v, posts: v.posts.map((p) => ({ ...p, vacancies: -3, eligible_districts: ["Atlantis"] })), overall_confidence: 1.5 }),
    fallback: () => null,
    ctx: { userId: s.run.createdBy, requestId: ctx.requestId, faultActorId: ctx.actor.kind === "user" && ctx.actor.role === "admin" ? ctx.actor.userId : null },
  });
  if (r.mode === "ai") return succeeded({ method: "ai", extraction: r.value });
  // Step-level retries first; on the last attempt fall back to a heuristic draft for review.
  if (s.step.attempts < s.step.maxAttempts) return retry(`AI_${r.outcome.toUpperCase()}`, r.reason);
  return succeeded({ method: "fallback", extraction: heuristicExtraction(text.text), needsReview: true, reason: r.reason });
}

// ───────── 4. normalize_validate ─────────

async function matchOrganization(db: Db, n: Normalized): Promise<{ id: string; verified: boolean; created: boolean }> {
  const name = n.organizationBn;
  const rows = await db.execute<{ id: string; verified: boolean; sim: number }>(sql`
    select id, verified, greatest(similarity(name_bn, ${name}), similarity(lower(name_en), lower(${n.organizationEn || name}))) as sim
    from ${organizations} where deleted_at is null
    order by sim desc limit 1`);
  const best = ((Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as { id: string; verified: boolean; sim: number }[])[0];
  if (best && Number(best.sim) >= 0.45) return { id: best.id, verified: best.verified, created: false };
  // New, unverified organization (idempotent by slug).
  const slug = `auto-${createHash("sha256").update(name).digest("hex").slice(0, 10)}`;
  await db
    .insert(organizations)
    .values({ nameBn: name.slice(0, 150), nameEn: (n.organizationEn || name).slice(0, 150), shortName: (n.organizationEn || "ORG").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "ORG", slug, type: "directorate", verified: false })
    .onConflictDoNothing();
  const [o] = await db.select({ id: organizations.id, verified: organizations.verified }).from(organizations).where(eq(organizations.slug, slug));
  return { id: o.id, verified: o.verified, created: true };
}

async function normalizeValidate(s: StepContext): Promise<StepResult> {
  const ex = out<{ extraction: Extraction; method: string; needsReview?: boolean }>(s, "ai_extract");
  const { value, flags } = normalizeExtraction(ex.extraction, districts, s.now);
  const critical = flags.filter((f) => f.critical);
  if (critical.length) {
    return failed("INVALID_FIELDS", critical.map((f) => f.message).join("; "), { normalized: value, flags });
  }
  const org = await matchOrganization(s.db, value);
  return succeeded({ normalized: value, flags, organizationId: org.id, organizationVerified: org.verified, organizationCreated: org.created, needsReview: Boolean(ex.needsReview) || ex.method !== "ai" });
}

type NormOut = { normalized: Normalized; flags: Flag[]; organizationId: string; organizationVerified: boolean; needsReview: boolean };

// ───────── 5. dedupe (→ apply_update branch) ─────────

async function dedupe(s: StepContext): Promise<StepResult> {
  const n = out<NormOut>(s, "normalize_validate");
  const v = n.normalized;
  const byNotice = v.noticeNo
    ? await s.db
        .select({ id: circulars.id, endAt: circulars.applicationEndAt, status: circulars.status })
        .from(circulars)
        .where(and(eq(circulars.organizationId, n.organizationId), eq(circulars.noticeNo, v.noticeNo), sql`${circulars.deletedAt} is null`, sql`${circulars.id} <> ${derivedId(`circular:${s.run.id}`)}`))
    : [];
  let match = byNotice[0];
  if (!match && v.endAt) {
    const similar = await s.db.execute<{ id: string; end_at: string; status: string }>(sql`
      select id, application_end_at as end_at, status from ${circulars}
      where deleted_at is null and organization_id = ${n.organizationId} and id <> ${derivedId(`circular:${s.run.id}`)}
        and similarity(title_bn, ${v.titleBn}) > 0.85
        and abs(extract(epoch from (application_end_at - ${v.endAt}::timestamptz))) < 86400
      limit 1`);
    const r = ((Array.isArray(similar) ? similar : (similar as { rows: unknown[] }).rows) as { id: string; end_at: string; status: string }[])[0];
    if (r) match = { id: r.id, endAt: new Date(r.end_at), status: r.status as never };
  }
  if (!match) return succeeded({ duplicateOf: null }, "tag_categorize");
  const newEnd = v.endAt ? new Date(v.endAt).getTime() : 0;
  if (newEnd > match.endAt.getTime() + 60_000) {
    // A corrigendum / deadline extension of an existing circular.
    return succeeded({ duplicateOf: match.id, kind: "extension", newEndAt: v.endAt }, "apply_update");
  }
  await s.updateRun({ circularId: match.id });
  return finish("duplicate", { duplicateOf: match.id, kind: "exact" });
}

// ───────── 6. apply_update ─────────

async function applyUpdate(s: StepContext): Promise<StepResult> {
  const d = out<{ duplicateOf: string; newEndAt: string }>(s, "dedupe");
  const ctx = await runCtx(s);
  const [c] = await s.db.select().from(circulars).where(eq(circulars.id, d.duplicateOf));
  if (!c) return failed("NOT_FOUND", "পুরনো সার্কুলার পাওয়া যায়নি");
  if (c.applicationEndAt.getTime() >= new Date(d.newEndAt).getTime()) {
    await s.updateRun({ circularId: c.id });
    return finish("succeeded", { circularId: c.id, alreadyApplied: true });
  }
  if (c.status !== "published" && c.status !== "closed") return failed("NOT_EXTENDABLE", "এই সার্কুলারের সময় বাড়ানো যায় না");
  await s.db.transaction((tx) => transitionInTx(ctx, tx, c.id, "extend", { newEndAt: d.newEndAt }, c.version));
  await s.updateRun({ circularId: c.id });
  return finish("succeeded", { circularId: c.id, extendedTo: d.newEndAt });
}

// ───────── 7. tag_categorize ─────────

async function tagCategorize(s: StepContext): Promise<StepResult> {
  const text = out<{ text: string }>(s, "extract_text").text;
  const n = out<NormOut>(s, "normalize_validate").normalized;
  const ctx = await runCtx(s);
  const r = await aiTag(ctx, `${n.titleBn}\n${n.posts.map((p) => p.titleBn).join(", ")}\n${text.slice(0, 3000)}`);
  return succeeded(r);
}

// ───────── 8. create_draft (one transaction) ─────────

async function createDraft(s: StepContext): Promise<StepResult> {
  const n = out<NormOut>(s, "normalize_validate");
  const tagOut = (out<{ categoryId: string; tagSlugs: string[]; confidence: number }>(s, "tag_categorize") ?? { categoryId: "cat_other", tagSlugs: [], confidence: 0 }) as {
    categoryId: string;
    tagSlugs: string[];
  };
  const v = n.normalized;
  const i = input(s);
  const id = derivedId(`circular:${s.run.id}`);
  const [org] = await s.db.select().from(organizations).where(eq(organizations.id, n.organizationId));
  const district = v.posts.flatMap((p) => p.eligibleDistrictIds).length === 1 ? v.posts[0].eligibleDistrictIds[0] : null;
  const startAt = v.startAt ?? new Date(s.now).toISOString();
  const salaries = v.posts.flatMap((p) => [p.salaryMin, p.salaryMax]).filter((x): x is number => x != null);
  await s.db.transaction(async (tx) => {
    await tx
      .insert(circulars)
      .values({
        id,
        organizationId: org.id,
        noticeNo: v.noticeNo,
        titleBn: v.titleBn,
        titleEn: v.titleEn,
        slug: `ingest-${s.run.id.slice(0, 8)}-${createHash("sha256").update(v.titleBn).digest("hex").slice(0, 6)}`,
        descriptionBn: "",
        sector: org.type === "company" ? "private" : org.type === "ngo" ? "ngo" : org.type === "autonomous" ? "autonomous" : "government",
        categoryId: tagOut.categoryId,
        districtId: district,
        divisionId: district ? (districtById.get(district)?.divisionId ?? null) : null,
        publishedOn: v.publishedOn,
        applicationStartAt: new Date(startAt),
        applicationEndAt: new Date(v.endAt!),
        ageReferenceDate: v.ageReferenceDate ?? v.publishedOn,
        applyUrl: v.applyUrl ?? "https://teletalk.com.bd",
        applyPlatform: v.applyPlatform,
        applicationFee: v.applicationFee,
        feeText: v.feeText,
        pdfPath: i.blobPath ?? null,
        pdfSha256: i.kind === "text" ? null : i.sha256,
        status: "pending_review",
        source: "pipeline",
        confidence: v.confidence,
        submittedBy: s.run.createdBy,
        totalVacancies: v.posts.reduce((a, p) => a + p.vacancies, 0),
        maxSalary: salaries.length ? Math.max(...salaries) : null,
        minSalary: salaries.length ? Math.min(...salaries) : null,
        searchText: buildCircularSearchText({
          titleBn: v.titleBn,
          titleEn: v.titleEn,
          noticeNo: v.noticeNo,
          organization: org,
          posts: v.posts.map((p) => ({ titleBn: p.titleBn, titleEn: p.titleEn, keywords: p.keywordsEn })),
          districtId: district,
          divisionId: null,
          categoryId: tagOut.categoryId,
          tagLabels: tagOut.tagSlugs.map((t) => tags.find((x) => x.slug === t)?.nameBn ?? ""),
          tax: { districts, divisions, categories },
        }),
      })
      .onConflictDoNothing({ target: circulars.id });
    for (const [k, p] of v.posts.entries()) {
      await tx
        .insert(circularPosts)
        .values({
          id: derivedId(`post:${s.run.id}:${k}`),
          circularId: id,
          position: k,
          titleBn: p.titleBn,
          titleEn: p.titleEn,
          vacancies: p.vacancies,
          grade: p.grade,
          salaryMin: p.salaryMin,
          salaryMax: p.salaryMax,
          salaryText: p.salaryText,
          minEducationLevel: p.minEducation,
          requiredSubjects: p.subjects,
          experienceYearsMin: p.experienceYears,
          ageMin: p.ageMin,
          ageMax: p.ageMax,
          ageRelaxations: p.ageRelaxations,
          eligibleDistrictIds: p.eligibleDistrictIds,
          genderRestriction: p.gender,
          otherRequirements: p.otherRequirements,
          keywordsEn: p.keywordsEn,
        })
        .onConflictDoNothing();
    }
    const tagIds = tagOut.tagSlugs.map((t) => tags.find((x) => x.slug === t)?.id).filter((x): x is string => Boolean(x));
    if (tagIds.length) await tx.insert(circularTags).values(tagIds.map((tagId) => ({ circularId: id, tagId, source: "ai" as const }))).onConflictDoNothing();
  });
  await s.updateRun({ circularId: id });
  return succeeded({ circularId: id, status: "pending_review" });
}

// ───────── 9. review_gate (conditional) ─────────

async function reviewGate(s: StepContext): Promise<StepResult> {
  const n = out<NormOut>(s, "normalize_validate");
  const reasons: string[] = [];
  if (n.normalized.confidence < AUTO_PUBLISH_CONFIDENCE) reasons.push(`confidence ${n.normalized.confidence.toFixed(2)} < ${AUTO_PUBLISH_CONFIDENCE}`);
  if (!n.organizationVerified) reasons.push("organization not verified");
  if (n.flags.length) reasons.push(`${n.flags.length} flagged field(s)`);
  if (n.needsReview) reasons.push("extracted without AI");
  if (!(await flagEnabled(s.db, "autoPublish"))) reasons.push("auto_publish is off");
  return reasons.length ? waiting({ reasons }) : succeeded({ autoPublished: true });
}

// ───────── 10. publish ─────────

async function publish(s: StepContext): Promise<StepResult> {
  const { circularId } = out<{ circularId: string }>(s, "create_draft");
  const [c] = await s.db.select().from(circulars).where(eq(circulars.id, circularId));
  if (!c) return failed("NOT_FOUND", "ড্রাফট পাওয়া যায়নি");
  if (c.status === "published" || c.status === "closed") return succeeded({ circularId, alreadyPublished: true });
  if (c.status !== "pending_review") return failed("NOT_PUBLISHABLE", `অবস্থা: ${c.status}`);
  const ctx = await runCtx(s);
  await s.db.transaction((tx) => transitionInTx(ctx, tx, circularId, "approve", {}, c.version));
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/sitemap.xml");
    revalidatePath(`/jobs/${c.slug}`);
  } catch {
    // Outside a request (worker/tests): nothing cached to revalidate.
  }
  return succeeded({ circularId, published: true });
}

// ───────── 11. notify_matches (batched, resumable) ─────────

async function notifyMatches(s: StepContext): Promise<StepResult> {
  const i = input(s);
  const circularId = (out<{ circularId: string }>(s, "create_draft") ?? { circularId: s.run.circularId! }).circularId;
  const prior = (s.step.output as { cursor?: string | null; notified?: number; batches?: number } | null) ?? {};
  let cursor = prior.cursor ?? null;
  let notified = prior.notified ?? 0;
  let batches = prior.batches ?? 0;
  const batchSize = i.notifyBatch ?? NOTIFY_BATCH;

  const [c] = await loadCirculars(s.db, eq(circulars.id, circularId), s.now);
  if (!c) return failed("NOT_FOUND", "সার্কুলার পাওয়া যায়নি");
  const [row] = await s.db.select({ searchText: circulars.searchText, minSalary: circulars.minSalary, maxSalary: circulars.maxSalary }).from(circulars).where(eq(circulars.id, circularId));
  const shape = {
    searchText: row.searchText,
    divisionId: c.divisionId,
    districtId: c.districtId,
    sector: c.sector,
    categoryId: c.categoryId,
    organizationId: c.organization.id,
    jobType: c.jobType,
    workMode: c.workMode,
    minSalary: row.minSalary,
    maxSalary: row.maxSalary,
    educationLevels: c.posts.map((p) => p.minEducation),
  };
  const circularDistricts = new Set([c.districtId, ...c.posts.flatMap((p) => p.eligibleDistrictIds ?? [])].filter(Boolean));

  for (;;) {
    if (i.failAfterBatches != null && batches >= i.failAfterBatches && !s.run.context.faultCleared) {
      return retry("INJECTED_FAILURE", `পরীক্ষার জন্য ইচ্ছাকৃত ব্যর্থতা (${batches} ব্যাচের পরে)`, { cursor, notified, batches });
    }
    const users = await s.db
      .select({ userId: profiles.userId, newMatches: notificationPreferences.newMatches, categoryIds: preferences.categoryIds, districtIds: preferences.districtIds })
      .from(profiles)
      .leftJoin(notificationPreferences, eq(notificationPreferences.userId, profiles.userId))
      .leftJoin(preferences, eq(preferences.userId, profiles.userId))
      .where(and(eq(profiles.role, "seeker"), eq(profiles.status, "active"), sql`${profiles.onboardingCompletedAt} is not null`, cursor ? gt(profiles.userId, cursor) : undefined))
      .orderBy(profiles.userId)
      .limit(batchSize);
    if (users.length === 0) break;
    const ids = users.map((u) => u.userId);
    const searches = await s.db.select({ userId: savedSearches.userId, filters: savedSearches.filters, alert: savedSearches.alertEnabled }).from(savedSearches).where(inArray(savedSearches.userId, ids));
    const matched: string[] = [];
    for (const u of users) {
      if (u.newMatches === false) continue;
      const bySearch = searches.some((x) => x.userId === u.userId && x.alert && circularMatchesFilters(shape, x.filters));
      const byPref = (u.categoryIds ?? []).includes(c.categoryId) && ((u.districtIds ?? []).length === 0 || (u.districtIds ?? []).some((d) => circularDistricts.has(d)));
      if (!bySearch && !byPref) continue;
      const profile = await loadProfile(s.db, u.userId, "");
      const eligible = c.posts.some(
        (p) => computeEligibility({ startAt: c.startAt, endAt: c.endAt, ageReferenceDate: c.ageReferenceDate, publishedOn: c.publishedAt?.slice(0, 10) ?? null }, p, profile, s.now, districtById).verdict !== "not_eligible",
      );
      if (eligible) matched.push(u.userId);
    }
    if (matched.length) {
      const inserted = await s.db
        .insert(notifications)
        .values(
          matched.map((userId) => ({
            userId,
            type: "new_match" as const,
            title: `নতুন মিল: ${c.titleBn}`.slice(0, 200),
            body: `${c.organization.nameBn} — শেষ তারিখ ${dhakaDateKey(c.endAt)}`,
            link: `/jobs/${c.slug}`,
            dedupeKey: `new_match:${circularId}:${userId}`,
          })),
        )
        .onConflictDoNothing({ target: notifications.dedupeKey })
        .returning({ id: notifications.id });
      notified += inserted.length;
      await enqueueEmails(s.db, { notificationIds: inserted.map((x) => x.id) });
    }
    cursor = ids[ids.length - 1];
    batches++;
    await s.progress({ cursor, notified, batches });
    if (users.length < batchSize) break;
  }
  return succeeded({ cursor, notified, batches, done: true });
}

/** Admin-only demo failure at a chosen step (until "Retry failed step" clears it). */
function injectedFailure(s: StepContext): StepResult | null {
  const i = input(s);
  if (i.failAt && i.failAt === s.step.name && !s.run.context.faultCleared) {
    return retry("INJECTED_FAILURE", "পরীক্ষার জন্য ইচ্ছাকৃত ব্যর্থতা (failAt)");
  }
  return null;
}

export const SKIPPABLE_STEPS = ["tag_categorize", "notify_matches"];

export const ingestWorkflow: WorkflowDef = {
  type: "circular_ingest",
  onStart: injectedFailure,
  steps: [
    { name: "validate_input", maxAttempts: 2, run: validateInput },
    { name: "extract_text", maxAttempts: 3, run: extractText },
    { name: "ai_extract", maxAttempts: 3, run: aiExtract },
    { name: "normalize_validate", maxAttempts: 2, run: normalizeValidate },
    { name: "dedupe", maxAttempts: 3, run: dedupe },
    { name: "apply_update", maxAttempts: 3, run: applyUpdate },
    { name: "tag_categorize", maxAttempts: 2, run: tagCategorize },
    { name: "create_draft", maxAttempts: 3, run: createDraft },
    { name: "review_gate", maxAttempts: 1, run: reviewGate },
    { name: "publish", maxAttempts: 3, run: publish },
    { name: "notify_matches", maxAttempts: 3, run: notifyMatches },
  ],
};

export const WORKFLOWS: Record<string, WorkflowDef> = { circular_ingest: ingestWorkflow };

export { skipped, CV_MAX_BYTES };
