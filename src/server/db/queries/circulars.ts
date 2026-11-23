import "server-only";
import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { effectiveCircularStatus } from "@/domain/state-machines";
import { districtById } from "@/domain/taxonomy";
import type { Circular, CircularListItem, CircularPost, OrganizationSummary } from "@/types";
import type { DbOrTx } from "@/server/db/client";
import { circularPosts, circularTags, circulars, organizations, tags } from "@/server/db/schema";

export type CircularRow = typeof circulars.$inferSelect;
export type PostRow = typeof circularPosts.$inferSelect;
export type OrgRow = typeof organizations.$inferSelect;

export function toOrgSummary(o: OrgRow): OrganizationSummary {
  return { id: o.id, slug: o.slug, nameBn: o.nameBn, nameEn: o.nameEn, shortName: o.shortName, verified: o.verified, type: o.type };
}

export function toPost(p: PostRow): CircularPost {
  return {
    id: p.id,
    circularId: p.circularId,
    titleBn: p.titleBn,
    titleEn: p.titleEn,
    vacancies: p.vacancies,
    grade: p.grade,
    salaryMin: p.salaryMin,
    salaryMax: p.salaryMax,
    salaryText: p.salaryText,
    minEducation: p.minEducationLevel,
    subjects: p.requiredSubjects,
    experienceYears: p.experienceYearsMin,
    ageMin: p.ageMin,
    ageMax: p.ageMax,
    ageRelaxations: p.ageRelaxations,
    eligibleDistrictIds: p.eligibleDistrictIds.length ? p.eligibleDistrictIds : null,
    eligibleDivisionIds: p.eligibleDivisionIds.length ? p.eligibleDivisionIds : null,
    gender: p.genderRestriction,
    otherRequirements: p.otherRequirements,
    manualChecks: p.otherRequirements,
    keywordsRequired: p.keywordsEn,
    keywordsPreferred: p.keywordsPreferred,
  };
}

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function toCircular(c: CircularRow, org: OrgRow, posts: PostRow[], tagSlugs: string[], now: number): Circular {
  const sorted = [...posts].sort((a, b) => a.position - b.position);
  return {
    id: c.id,
    slug: c.slug,
    organization: toOrgSummary(org),
    noticeNo: c.noticeNo ?? "",
    titleBn: c.titleBn,
    titleEn: c.titleEn,
    descriptionBn: c.descriptionBn,
    howToApplyBn: c.howToApplyBn,
    sector: c.sector,
    jobType: c.jobType,
    workMode: c.workMode,
    categoryId: c.categoryId,
    districtId: c.districtId,
    divisionId: c.divisionId,
    tagSlugs,
    aiTags: c.aiTags,
    applyPlatform: c.applyPlatform,
    applyUrl: c.applyUrl,
    applicationFee: c.applicationFee,
    startAt: c.applicationStartAt.toISOString(),
    endAt: c.applicationEndAt.toISOString(),
    originalEndAt: iso(c.originalEndAt),
    ageReferenceDate: c.ageReferenceDate ?? c.publishedOn ?? c.applicationStartAt.toISOString().slice(0, 10),
    sourceUrl: c.sourceUrl ?? "",
    noticePdfUrl: c.pdfPath ? `/api/circulars/${c.id}/pdf` : null,
    status: effectiveCircularStatus(c.status, c.applicationEndAt.toISOString(), now),
    posts: sorted.map(toPost),
    totalVacancies: c.totalVacancies,
    publishedAt: iso(c.publishedAt),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    version: c.version,
  };
}

/** Load full circulars (with organization, posts and tags) matching `where`, in `ids` order if given. */
export async function loadCirculars(db: DbOrTx, where: SQL | undefined, now: number): Promise<Circular[]> {
  const rows = await db
    .select({ c: circulars, o: organizations })
    .from(circulars)
    .innerJoin(organizations, eq(organizations.id, circulars.organizationId))
    .where(and(isNull(circulars.deletedAt), where));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.c.id);
  const [posts, tagRows] = await Promise.all([
    db.select().from(circularPosts).where(inArray(circularPosts.circularId, ids)).orderBy(asc(circularPosts.position)),
    db
      .select({ circularId: circularTags.circularId, slug: tags.slug })
      .from(circularTags)
      .innerJoin(tags, eq(tags.id, circularTags.tagId))
      .where(inArray(circularTags.circularId, ids)),
  ]);
  const postsBy = groupBy(posts, (p) => p.circularId);
  const tagsBy = groupBy(tagRows, (t) => t.circularId);
  return rows.map((r) => toCircular(r.c, r.o, postsBy.get(r.c.id) ?? [], (tagsBy.get(r.c.id) ?? []).map((t) => t.slug), now));
}

export async function loadCircularsByIds(db: DbOrTx, ids: string[], now: number): Promise<Circular[]> {
  if (ids.length === 0) return [];
  const list = await loadCirculars(db, inArray(circulars.id, ids), now);
  const by = new Map(list.map((c) => [c.id, c]));
  return ids.map((id) => by.get(id)).filter((c): c is Circular => Boolean(c));
}

export function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** Compact card row. */
export function toListItem(c: Circular, bookmarkedPostIds: Set<string>): CircularListItem {
  const salaries = c.posts.flatMap((p) => [p.salaryMin, p.salaryMax]).filter((v): v is number => v != null);
  return {
    id: c.id,
    slug: c.slug,
    organization: c.organization,
    titleBn: c.titleBn,
    sector: c.sector,
    jobType: c.jobType,
    workMode: c.workMode,
    districtId: c.districtId,
    aiTags: c.aiTags,
    applyPlatform: c.applyPlatform,
    startAt: c.startAt,
    endAt: c.endAt,
    originalEndAt: c.originalEndAt,
    publishedAt: c.publishedAt,
    totalVacancies: c.totalVacancies,
    categoryId: c.categoryId,
    primaryPostId: c.posts[0]?.id ?? "",
    postCount: c.posts.length,
    salaryMin: salaries.length ? Math.min(...salaries) : null,
    salaryMax: salaries.length ? Math.max(...salaries) : null,
    districtNameBn: c.districtId ? (districtById.get(c.districtId)?.nameBn ?? null) : null,
    bookmarked: c.posts.some((p) => bookmarkedPostIds.has(p.id)),
  };
}

/** Public visibility: published (or closed) and not deleted. */
export const isPublicCircular = sql`${circulars.status} in ('published', 'closed') and ${circulars.deletedAt} is null`;
