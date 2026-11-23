import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { dhakaDateKey, formatDateBn } from "@/domain/bn";
import {
  actionPath,
  canExtendDeadline,
  canTransitionCircular,
  effectiveCircularStatus,
  type CircularTransitionCtx,
} from "@/domain/state-machines";
import { buildCircularSearchText } from "@/domain/search-parser";
import { categories, districtById, divisions, tags as tagList } from "@/domain/taxonomy";
import type { AdminCircularRow, Circular, CircularAction, CircularRevision, CircularStatus, ReviewQueueItem } from "@/types";
import type { CircularPayload } from "@/schemas/api";
import { authorize, requireUser } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import type { Ctx } from "@/server/context";
import type { DbOrTx, Tx } from "@/server/db/client";
import { loadCirculars } from "@/server/db/queries/circulars";
import {
  applications,
  auditLogs,
  circularPosts,
  circularRevisions,
  circularTags,
  circulars,
  organizations,
  profiles,
  type RevisionSnapshot,
} from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { notifyBookmarkers } from "./notifications";

type CircularRow = typeof circulars.$inferSelect;

/** Fields whose change matters to applicants (spec §4.1): creates a revision and notifies. */
const CRITICAL_FIELDS = ["startAt", "endAt", "ageReferenceDate", "posts.vacancies", "posts.age", "posts.eligibility"] as const;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function randomSuffix(): string {
  return [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildSearchText(p: CircularPayload, org: { nameBn: string; nameEn: string; shortName: string }): string {
  return buildCircularSearchText({
    titleBn: p.titleBn,
    titleEn: p.titleEn,
    noticeNo: p.noticeNo,
    organization: org,
    posts: p.posts.map((x) => ({ titleBn: x.titleBn, titleEn: x.titleEn, keywords: x.keywordsRequired })),
    districtId: p.districtId,
    divisionId: p.divisionId,
    categoryId: p.categoryId,
    tagLabels: p.tagSlugs.map((s) => tagList.find((t) => t.slug === s)?.nameBn ?? ""),
    tax: { districts: [...districtById.values()], divisions, categories },
  });
}

function denormalized(p: CircularPayload) {
  const salaries = p.posts.flatMap((x) => [x.salaryMin, x.salaryMax]).filter((v): v is number => v != null);
  return {
    totalVacancies: p.posts.reduce((n, x) => n + x.vacancies, 0),
    maxSalary: salaries.length ? Math.max(...salaries) : null,
    minSalary: salaries.length ? Math.min(...salaries) : null,
  };
}

function postValues(circularId: string, x: CircularPayload["posts"][number], position: number) {
  return {
    circularId,
    position,
    titleBn: x.titleBn,
    titleEn: x.titleEn ?? "",
    vacancies: x.vacancies,
    grade: x.grade || null,
    salaryMin: x.salaryMin,
    salaryMax: x.salaryMax,
    salaryText: x.salaryText || null,
    minEducationLevel: x.minEducation,
    requiredSubjects: x.subjects,
    experienceYearsMin: x.experienceYears,
    ageMin: x.ageMin,
    ageMax: x.ageMax,
    ageRelaxations: x.ageRelaxations,
    eligibleDistrictIds: x.eligibleDistrictIds ?? [],
    eligibleDivisionIds: x.eligibleDivisionIds ?? [],
    genderRestriction: x.gender,
    otherRequirements: x.otherRequirements,
    keywordsEn: x.keywordsRequired,
    keywordsPreferred: x.keywordsPreferred,
    updatedAt: new Date(),
  };
}

function validateRefs(p: CircularPayload) {
  if (!categories.some((c) => c.id === p.categoryId)) throw new AppError("VALIDATION", { fields: { categoryId: "ক্যাটাগরি পাওয়া যায়নি" } });
  if (p.districtId && !districtById.has(p.districtId)) throw new AppError("VALIDATION", { fields: { districtId: "জেলা পাওয়া যায়নি" } });
  if (p.divisionId && !divisions.some((d) => d.id === p.divisionId)) throw new AppError("VALIDATION", { fields: { divisionId: "বিভাগ পাওয়া যায়নি" } });
  for (const x of p.posts) {
    for (const d of x.eligibleDistrictIds ?? []) if (!districtById.has(d)) throw new AppError("VALIDATION", { fields: { posts: "জেলা পাওয়া যায়নি" } });
  }
}

/** Compare two payload-shaped snapshots and list the changed fields. */
function diff(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
}

function snapshotOf(c: Circular): Record<string, unknown> {
  return {
    titleBn: c.titleBn,
    titleEn: c.titleEn,
    noticeNo: c.noticeNo,
    organizationId: c.organization.id,
    startAt: c.startAt,
    endAt: c.endAt,
    ageReferenceDate: c.ageReferenceDate,
    applyUrl: c.applyUrl,
    applicationFee: c.applicationFee,
    "posts.vacancies": c.posts.map((p) => p.vacancies),
    "posts.age": c.posts.map((p) => [p.ageMin, p.ageMax, p.ageRelaxations]),
    "posts.eligibility": c.posts.map((p) => [p.minEducation, p.subjects, p.experienceYears, p.eligibleDistrictIds, p.eligibleDivisionIds, p.gender]),
    "posts.titles": c.posts.map((p) => p.titleBn),
  };
}

function payloadSnapshot(p: CircularPayload): Record<string, unknown> {
  return {
    titleBn: p.titleBn,
    titleEn: p.titleEn ?? "",
    noticeNo: p.noticeNo,
    organizationId: p.organizationId,
    startAt: new Date(p.startAt).toISOString(),
    endAt: new Date(p.endAt).toISOString(),
    ageReferenceDate: p.ageReferenceDate,
    applyUrl: p.applyUrl,
    applicationFee: p.applicationFee,
    "posts.vacancies": p.posts.map((x) => x.vacancies),
    "posts.age": p.posts.map((x) => [x.ageMin, x.ageMax, x.ageRelaxations]),
    "posts.eligibility": p.posts.map((x) => [x.minEducation, x.subjects, x.experienceYears, x.eligibleDistrictIds?.length ? x.eligibleDistrictIds : null, x.eligibleDivisionIds?.length ? x.eligibleDivisionIds : null, x.gender]),
    "posts.titles": p.posts.map((x) => x.titleBn),
  };
}

export function toAdminRow(c: Pick<CircularRow, "id" | "slug" | "titleBn" | "status" | "applicationEndAt" | "source" | "updatedAt" | "version">, orgNameBn: string, postCount: number, now: number): AdminCircularRow {
  return {
    id: c.id,
    slug: c.slug,
    titleBn: c.titleBn,
    organizationNameBn: orgNameBn,
    status: effectiveCircularStatus(c.status, c.applicationEndAt.toISOString(), now),
    endAt: c.applicationEndAt.toISOString(),
    postCount,
    source: c.source === "pipeline" ? "pdf_upload" : "manual",
    updatedAt: c.updatedAt.toISOString(),
    version: c.version,
  };
}

async function adminRowFor(db: DbOrTx, id: string, now: number): Promise<AdminCircularRow> {
  const [r] = await db
    .select({ c: circulars, orgNameBn: organizations.nameBn, postCount: sql<number>`(select count(*)::int from ${circularPosts} p where p.circular_id = ${circulars.id})` })
    .from(circulars)
    .innerJoin(organizations, eq(organizations.id, circulars.organizationId))
    .where(eq(circulars.id, id));
  if (!r) throw new AppError("NOT_FOUND");
  return toAdminRow(r.c, r.orgNameBn, Number(r.postCount), now);
}

// ───────── reads ─────────

export async function listAdminCirculars(ctx: Ctx, db: DbOrTx, f: { q?: string; status?: CircularStatus | "all" }): Promise<AdminCircularRow[]> {
  authorize(ctx.actor, "circular.edit_draft");
  const now = ctx.now();
  const q = f.q?.trim().toLowerCase();
  const statusCond =
    !f.status || f.status === "all"
      ? undefined
      : f.status === "closed"
        ? sql`(${circulars.status} = 'closed' or (${circulars.status} = 'published' and ${circulars.applicationEndAt} <= now()))`
        : f.status === "published"
          ? sql`(${circulars.status} = 'published' and ${circulars.applicationEndAt} > now())`
          : eq(circulars.status, f.status);
  const rows = await db
    .select({ c: circulars, orgNameBn: organizations.nameBn, postCount: sql<number>`(select count(*)::int from ${circularPosts} p where p.circular_id = ${circulars.id})` })
    .from(circulars)
    .innerJoin(organizations, eq(organizations.id, circulars.organizationId))
    .where(
      and(
        sql`${circulars.deletedAt} is null`,
        statusCond,
        q ? sql`(${circulars.searchText} ilike ${`%${q}%`} or lower(${organizations.nameBn}) like ${`%${q}%`})` : undefined,
      ),
    )
    .orderBy(desc(circulars.updatedAt))
    .limit(500);
  return rows.map((r) => toAdminRow(r.c, r.orgNameBn, Number(r.postCount), now));
}

export async function getAdminCircular(ctx: Ctx, db: DbOrTx, id: string): Promise<Circular> {
  authorize(ctx.actor, "circular.edit_draft");
  const [c] = await loadCirculars(db, eq(circulars.id, id), ctx.now());
  if (!c) throw new AppError("NOT_FOUND");
  return c;
}

// ───────── create / edit (one transaction) ─────────

export async function saveCircular(
  ctx: Ctx,
  tx: Tx,
  p: CircularPayload,
  version: number | null,
  intent: "draft" | "submit" | "publish",
): Promise<Circular> {
  const userId = requireUser(ctx.actor, "circular.edit_draft", { mutation: true });
  validateRefs(p);
  const now = ctx.now();
  const [org] = await tx.select().from(organizations).where(and(eq(organizations.id, p.organizationId), sql`${organizations.deletedAt} is null`));
  if (!org) throw new AppError("VALIDATION", { fields: { organizationId: "প্রতিষ্ঠান পাওয়া যায়নি" } });

  const common = {
    organizationId: p.organizationId,
    noticeNo: p.noticeNo,
    titleBn: p.titleBn,
    titleEn: p.titleEn ?? "",
    descriptionBn: p.descriptionBn ?? "",
    sector: p.sector,
    jobType: p.jobType,
    workMode: p.workMode,
    categoryId: p.categoryId,
    divisionId: p.divisionId ?? (p.districtId ? (districtById.get(p.districtId)?.divisionId ?? null) : null),
    districtId: p.districtId,
    applicationStartAt: new Date(p.startAt),
    applicationEndAt: new Date(p.endAt),
    ageReferenceDate: p.ageReferenceDate,
    applyUrl: p.applyUrl,
    applyPlatform: p.applyPlatform,
    applicationFee: p.applicationFee,
    sourceUrl: p.sourceUrl || null,
    searchText: buildSearchText(p, org),
    ...denormalized(p),
    updatedAt: new Date(now),
  };

  let id: string;
  let before: Circular | null = null;
  if (p.id) {
    const [existing] = await loadCirculars(tx, eq(circulars.id, p.id), now);
    if (!existing) throw new AppError("NOT_FOUND");
    if (version == null || existing.version !== version) throw new AppError("CONFLICT");
    if (["cancelled", "archived", "closed"].includes(existing.status)) {
      throw new AppError("ILLEGAL_TRANSITION", { message_bn: "এই অবস্থায় সার্কুলার সম্পাদনা করা যায় না।" });
    }
    before = existing;
    id = existing.id;
    // Editing a rejected circular sends it back to draft (rejected → draft).
    const nextStatus: CircularStatus = existing.status === "rejected" ? "draft" : (existing.status as CircularStatus);
    const updated = await tx
      .update(circulars)
      .set({ ...common, status: nextStatus, version: sql`${circulars.version} + 1` })
      .where(and(eq(circulars.id, id), eq(circulars.version, version)))
      .returning({ id: circulars.id });
    if (updated.length === 0) throw new AppError("CONFLICT");

    // Posts are upserted by id so bookmarks and applications keep pointing at them.
    const existingIds = new Set(existing.posts.map((x) => x.id));
    const keepIds = new Set(p.posts.map((x) => x.id).filter((x) => existingIds.has(x)));
    const removed = [...existingIds].filter((x) => !keepIds.has(x));
    if (removed.length) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(applications).where(inArray(applications.circularPostId, removed));
      if (Number(n) > 0) throw new AppError("VALIDATION", { message_bn: "যে পদে আবেদন ট্র্যাক করা আছে সেটি মুছে ফেলা যাবে না।" });
      await tx.delete(circularPosts).where(inArray(circularPosts.id, removed));
    }
    for (const [i, x] of p.posts.entries()) {
      if (keepIds.has(x.id)) await tx.update(circularPosts).set(postValues(id, x, i)).where(eq(circularPosts.id, x.id));
      else await tx.insert(circularPosts).values(postValues(id, x, i));
    }
  } else {
    const base = slugify(p.titleEn || p.noticeNo) || "circular";
    const [row] = await tx
      .insert(circulars)
      .values({ ...common, slug: `${base}-${randomSuffix()}`, status: "draft", source: "manual", submittedBy: userId })
      .returning({ id: circulars.id });
    id = row.id;
    await tx.insert(circularPosts).values(p.posts.map((x, i) => postValues(id, x, i)));
  }

  // Tags (manual).
  await tx.delete(circularTags).where(and(eq(circularTags.circularId, id), eq(circularTags.source, "manual")));
  const tagIds = p.tagSlugs.map((s) => tagList.find((t) => t.slug === s)?.id).filter((x): x is string => Boolean(x));
  if (tagIds.length) await tx.insert(circularTags).values(tagIds.map((tagId) => ({ circularId: id, tagId, source: "manual" as const }))).onConflictDoNothing();

  // Revision + notifications for edits.
  if (before) {
    const prev = snapshotOf(before);
    const next = payloadSnapshot(p);
    const changed = diff(prev, next);
    if (changed.length) {
      const critical = changed.some((f) => (CRITICAL_FIELDS as readonly string[]).includes(f));
      const snapshot: RevisionSnapshot = {
        before: Object.fromEntries(changed.map((f) => [f, prev[f]])),
        after: Object.fromEntries(changed.map((f) => [f, next[f]])),
      };
      const [{ revision }] = await tx
        .update(circulars)
        .set({ revision: sql`${circulars.revision} + 1` })
        .where(eq(circulars.id, id))
        .returning({ revision: circulars.revision });
      await tx.insert(circularRevisions).values({ circularId: id, snapshot, changedFields: changed, critical, changedBy: userId });
      if (critical && before.status === "published") {
        await notifyBookmarkers(tx, id, {
          type: "deadline",
          title: "সেভ করা সার্কুলারে গুরুত্বপূর্ণ পরিবর্তন",
          body: `${before.titleBn} — তারিখ, পদ বা যোগ্যতার তথ্য বদলেছে। আবার দেখে নিন।`,
          link: `/jobs/${before.slug}`,
          dedupe: `revision:${id}:${revision}`,
        });
      }
    }
  }
  await writeAudit(tx, ctx, {
    action: before ? "circular.update" : "circular.create",
    entityType: "circular",
    entityId: id,
    before: before ? { status: before.status, version: before.version } : null,
    after: { titleBn: p.titleBn, intent },
  });

  if (intent !== "draft") {
    const [row] = await tx.select({ status: circulars.status, version: circulars.version }).from(circulars).where(eq(circulars.id, id));
    if (row.status === "draft" || row.status === "rejected") await transitionInTx(ctx, tx, id, "submit_review", {}, row.version);
    if (intent === "publish") {
      const [after] = await tx.select({ status: circulars.status, version: circulars.version }).from(circulars).where(eq(circulars.id, id));
      if (after.status === "pending_review") await transitionInTx(ctx, tx, id, "approve", {}, after.version);
    }
  }
  const [out] = await loadCirculars(tx, eq(circulars.id, id), now);
  return out;
}

// ───────── transitions ─────────

export async function transitionInTx(
  ctx: Ctx,
  tx: Tx,
  id: string,
  action: CircularAction,
  payload: { reason?: string; newEndAt?: string },
  version: number,
): Promise<void> {
  const userId = requireUser(ctx.actor, "circular.moderate", { mutation: true });
  const now = ctx.now();
  const [row] = await tx
    .select({ c: circulars, orgVerified: organizations.verified, postCount: sql<number>`(select count(*)::int from ${circularPosts} p where p.circular_id = ${circulars.id})` })
    .from(circulars)
    .innerJoin(organizations, eq(organizations.id, circulars.organizationId))
    .where(and(eq(circulars.id, id), sql`${circulars.deletedAt} is null`));
  if (!row) throw new AppError("NOT_FOUND");
  const c = row.c;
  if (c.version !== version) throw new AppError("CONFLICT");

  const tctx: CircularTransitionCtx = {
    role: ctx.actor.kind === "user" && (ctx.actor.role === "admin" || ctx.actor.role === "moderator") ? ctx.actor.role : "seeker",
    now,
    postCount: Number(row.postCount),
    startAt: c.applicationStartAt.toISOString(),
    endAt: c.applicationEndAt.toISOString(),
    newEndAt: payload.newEndAt ?? null,
    organizationExists: true,
    organizationVerified: row.orgVerified,
    closedAt: c.closedAt?.toISOString() ?? c.applicationEndAt.toISOString(),
    reason: payload.reason ?? null,
  };

  // A published circular past its deadline is closed; persist that first (legal edge).
  let from: CircularStatus = c.status;
  const set: Partial<typeof circulars.$inferInsert> = {};
  if (from === "published" && effectiveCircularStatus(from, tctx.endAt, now) === "closed") {
    const ok = canTransitionCircular("published", "closed", tctx);
    if (!ok.ok) throw new AppError("ILLEGAL_TRANSITION", { message_bn: ok.message_bn });
    from = "closed";
    set.status = "closed";
    set.closedAt = c.applicationEndAt;
  }

  const path = actionPath(action, from);
  if (!path) throw new AppError("ILLEGAL_TRANSITION");

  if (action === "extend") {
    const ok = canExtendDeadline(from, tctx);
    if (!ok.ok) {
      throw new AppError(ok.reasonCode === "FORBIDDEN" ? "FORBIDDEN" : ok.reasonCode.startsWith("NEW_END") ? "VALIDATION" : "ILLEGAL_TRANSITION", {
        message_bn: ok.message_bn,
        ...(ok.reasonCode.startsWith("NEW_END") ? { fields: { newEnd: ok.message_bn } } : {}),
      });
    }
  }
  let cur = from;
  for (const next of path) {
    const ok = canTransitionCircular(cur, next, tctx);
    if (!ok.ok) {
      throw new AppError(ok.reasonCode === "FORBIDDEN" ? "FORBIDDEN" : ok.reasonCode === "REASON_REQUIRED" ? "VALIDATION" : "ILLEGAL_TRANSITION", {
        message_bn: ok.message_bn,
        ...(ok.reasonCode === "REASON_REQUIRED" ? { fields: { reason: ok.message_bn } } : {}),
      });
    }
    cur = next;
  }

  const after: CircularStatus = path.length ? path[path.length - 1] : from;
  set.status = after;
  if (action === "submit_review") set.submittedBy = userId;
  if (action === "approve") {
    set.publishedAt = new Date(now);
    set.publishedOn = c.publishedOn ?? dhakaDateKey(now);
    set.reviewedBy = userId;
    set.reviewNote = null;
  }
  if (action === "reject") {
    set.reviewNote = payload.reason ?? null;
    set.reviewedBy = userId;
  }
  if (action === "extend") {
    set.originalEndAt = c.originalEndAt ?? c.applicationEndAt;
    set.applicationEndAt = new Date(payload.newEndAt!);
    set.closedAt = null;
    set.revision = c.revision + 1;
  }
  if (after === "closed" && !set.closedAt) set.closedAt = new Date(now);

  const updated = await tx
    .update(circulars)
    .set({ ...set, version: sql`${circulars.version} + 1`, updatedAt: new Date(now) })
    .where(and(eq(circulars.id, id), eq(circulars.version, version)))
    .returning({ id: circulars.id });
  if (updated.length === 0) throw new AppError("CONFLICT");

  if (action === "extend") {
    await tx.insert(circularRevisions).values({
      circularId: id,
      snapshot: { before: { endAt: c.applicationEndAt.toISOString(), status: from }, after: { endAt: payload.newEndAt, status: after } },
      changedFields: ["endAt"],
      critical: true,
      changedBy: userId,
    });
    await notifyBookmarkers(tx, id, {
      type: "deadline",
      title: "সময় বৃদ্ধি হয়েছে",
      body: `${c.titleBn} — নতুন শেষ সময় ${formatDateBn(payload.newEndAt!)}`,
      link: `/jobs/${c.slug}`,
      dedupe: `extend:${id}:${c.revision + 1}`,
    });
  }
  if (action === "cancel") {
    await notifyBookmarkers(tx, id, {
      type: "system",
      title: "সার্কুলার বাতিল হয়েছে",
      body: `${c.titleBn} বাতিল করা হয়েছে।`,
      link: `/jobs/${c.slug}`,
      dedupe: `cancel:${id}`,
    });
  }
  // Public pages and the sitemap pick up the change (no-op outside a request).
  try {
    const { revalidateTag } = await import("next/cache");
    revalidateTag("sitemap", "max");
    revalidateTag(`circular:${c.slug}`, "max");
  } catch {
    // tests / scripts
  }
  // A moderator decision resumes (or closes) an ingestion run waiting at its review gate.
  if ((action === "approve" || action === "reject") && from === "pending_review") {
    const { resumeAfterReview } = await import("./workflows");
    await resumeAfterReview(tx, id, action === "approve" ? "approved" : "rejected", userId, now);
  }
  await writeAudit(tx, ctx, {
    action: `circular.${action}`,
    entityType: "circular",
    entityId: id,
    before: { status: c.status, endAt: c.applicationEndAt.toISOString() },
    after: { status: after, endAt: set.applicationEndAt?.toISOString() ?? c.applicationEndAt.toISOString(), ...(payload.reason ? { reason: payload.reason } : {}) },
  });
}

export async function transitionCircular(
  ctx: Ctx,
  tx: Tx,
  id: string,
  action: CircularAction,
  payload: { reason?: string; newEndAt?: string },
  version: number,
): Promise<AdminCircularRow> {
  await transitionInTx(ctx, tx, id, action, payload, version);
  return adminRowFor(tx, id, ctx.now());
}

export async function getCircularRevisions(ctx: Ctx, db: DbOrTx, id: string): Promise<CircularRevision[]> {
  authorize(ctx.actor, "circular.edit_draft");
  const [revs, audits] = await Promise.all([
    db
      .select({ r: circularRevisions, name: profiles.fullName })
      .from(circularRevisions)
      .leftJoin(profiles, eq(profiles.userId, circularRevisions.changedBy))
      .where(eq(circularRevisions.circularId, id))
      .orderBy(desc(circularRevisions.createdAt)),
    db
      .select({ a: auditLogs, name: profiles.fullName })
      .from(auditLogs)
      .leftJoin(profiles, eq(profiles.userId, auditLogs.actorId))
      .where(and(eq(auditLogs.entityType, "circular"), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt)),
  ]);
  const show = (v: unknown) => (v == null ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  const fromRevisions: CircularRevision[] = revs.map(({ r, name }) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    actorName: name || "—",
    changes: r.changedFields.map((f) => ({ field: f, before: show(r.snapshot.before[f]), after: show(r.snapshot.after[f]) })),
  }));
  const fromAudit: CircularRevision[] = audits
    .filter(({ a }) => a.action !== "circular.update")
    .map(({ a, name }) => ({
      id: a.id,
      at: a.createdAt.toISOString(),
      actorName: name || "—",
      changes: Object.keys(a.after ?? {}).map((k) => ({ field: k, before: show(a.before?.[k]), after: show(a.after?.[k]) })),
    }));
  return [...fromRevisions, ...fromAudit].sort((x, y) => y.at.localeCompare(x.at));
}

// ───────── review queue ─────────

function reviewFields(c: Circular, confidence: number): ReviewQueueItem["fields"] {
  const low = (n: number) => Math.min(1, n);
  const p0 = c.posts[0];
  return [
    { key: "titleBn", labelBn: "শিরোনাম", value: c.titleBn, confidence: low(confidence + 0.1) },
    { key: "noticeNo", labelBn: "বিজ্ঞপ্তি নং", value: c.noticeNo, confidence: low(confidence) },
    { key: "organization", labelBn: "প্রতিষ্ঠান", value: c.organization.nameBn, confidence: low(confidence + 0.1) },
    { key: "endAt", labelBn: "আবেদনের শেষ সময়", value: formatDateBn(c.endAt), confidence: low(confidence) },
    { key: "vacancies", labelBn: "মোট পদ", value: String(c.totalVacancies), confidence: low(confidence - 0.05) },
    ...(p0 ? [{ key: "ageMax", labelBn: "সর্বোচ্চ বয়স", value: p0.ageMax != null ? String(p0.ageMax) : "—", confidence: low(confidence - 0.1) }] : []),
  ];
}

export async function listReviewQueue(ctx: Ctx, db: DbOrTx): Promise<ReviewQueueItem[]> {
  authorize(ctx.actor, "circular.moderate");
  const list = await loadCirculars(db, eq(circulars.status, "pending_review"), ctx.now());
  const rows = await db.select({ id: circulars.id, confidence: circulars.confidence, source: circulars.source, updatedAt: circulars.updatedAt, pdf: circulars.pdfPath }).from(circulars).where(eq(circulars.status, "pending_review"));
  const meta = new Map(rows.map((r) => [r.id, r]));
  return list
    .map((c) => {
      const m = meta.get(c.id)!;
      const confidence = m.confidence ?? 1;
      return {
        id: c.id,
        circularId: c.id,
        runId: "",
        titleBn: c.titleBn,
        source: m.source === "pipeline" ? "স্বয়ংক্রিয় ইনজেস্ট" : "ম্যানুয়াল এন্ট্রি",
        confidence,
        waitingSince: m.updatedAt.toISOString(),
        pdfUrl: c.noticePdfUrl,
        fields: reviewFields(c, confidence),
      };
    })
    .sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
}

export async function getReviewItem(ctx: Ctx, db: DbOrTx, id: string): Promise<ReviewQueueItem> {
  const items = await listReviewQueue(ctx, db);
  const item = items.find((x) => x.id === id);
  if (!item) throw new AppError("NOT_FOUND");
  return item;
}

/** Approve or reject (reason required). Simple edited fields are applied before approving. */
export async function decideReview(
  ctx: Ctx,
  tx: Tx,
  id: string,
  decision: "approve" | "reject",
  payload: { reason?: string; fields?: Record<string, string> },
): Promise<{ circularId: string }> {
  requireUser(ctx.actor, "circular.moderate", { mutation: true });
  const [c] = await tx.select().from(circulars).where(eq(circulars.id, id));
  if (!c || c.status !== "pending_review") throw new AppError("NOT_FOUND");
  if (decision === "reject" && !payload.reason?.trim()) {
    throw new AppError("VALIDATION", { fields: { reason: "প্রত্যাখ্যানের কারণ লিখুন।" } });
  }
  let version = c.version;
  const edits = payload.fields ?? {};
  const editable: Partial<typeof circulars.$inferInsert> = {};
  if (edits.titleBn?.trim() && edits.titleBn.trim() !== c.titleBn) editable.titleBn = edits.titleBn.trim().slice(0, 200);
  if (edits.noticeNo?.trim() && edits.noticeNo.trim() !== c.noticeNo) editable.noticeNo = edits.noticeNo.trim().slice(0, 120);
  if (Object.keys(editable).length) {
    const [r] = await tx
      .update(circulars)
      .set({ ...editable, version: sql`${circulars.version} + 1`, updatedAt: new Date(ctx.now()) })
      .where(and(eq(circulars.id, id), eq(circulars.version, version)))
      .returning({ version: circulars.version });
    if (!r) throw new AppError("CONFLICT");
    version = r.version;
    await writeAudit(tx, ctx, { action: "circular.review_edit", entityType: "circular", entityId: id, before: { titleBn: c.titleBn, noticeNo: c.noticeNo }, after: editable });
  }
  await transitionInTx(ctx, tx, id, decision, { reason: payload.reason }, version);
  return { circularId: id };
}

