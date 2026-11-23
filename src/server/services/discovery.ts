import "server-only";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { dhakaDateKey } from "@/domain/bn";
import { computeEligibility, passesEligibleOnly } from "@/domain/eligibility";
import { normalizeQuery, parseQueryRules } from "@/domain/search-parser";
import { categories, districtById, districts, divisions, tags as tagList } from "@/domain/taxonomy";
import { t } from "@/i18n";
import { EDUCATION_LEVELS } from "@/types";
import type {
  Bookmark,
  CircularDetail,
  CircularListItem,
  EligibilityResult,
  FacetKey,
  FacetOption,
  Facets,
  JobFilters,
  LandingStats,
  Organization,
  OrganizationDetail,
  Page,
  ParsedSearch,
  SavedSearch,
  Taxonomy,
  ZeroResultSuggestion,
} from "@/types";
import { authorize, requireUser } from "@/server/authz";
import type { Ctx } from "@/server/context";
import type { DbOrTx, Tx } from "@/server/db/client";
import {
  iso,
  isPublicCircular,
  loadCirculars,
  loadCircularsByIds,
  toListItem,
} from "@/server/db/queries/circulars";
import {
  applications,
  bookmarks,
  circularCounterDedupe,
  circularPosts,
  circularReports,
  circulars,
  organizations,
  savedSearches,
  searchLogs,
} from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { loadProfile } from "./profile";

const PAGE_SIZE = 10;
const DAY = 86_400_000;

// ───────── filter → SQL ─────────

const ts = (ms: number) => sql`${new Date(ms).toISOString()}::timestamptz`;

/** Tokens of a text query (lower-cased, both digit sets → English). */
function tokens(q: string): string[] {
  return normalizeQuery(q)
    .split(" ")
    .map((x) => x.replace(/[%_\\]/g, ""))
    .filter((x) => x.length > 0)
    .slice(0, 8);
}

/** Text match: every token appears (ILIKE), or the whole query is a close trigram match. */
function textCondition(q: string): SQL | undefined {
  const toks = tokens(q);
  if (toks.length === 0) return undefined;
  const all = sql.join(
    toks.map((tk) => sql`${circulars.searchText} ilike ${`%${tk}%`}`),
    sql` and `,
  );
  const whole = normalizeQuery(q);
  return sql`((${all}) or word_similarity(${whole}, ${circulars.searchText}) > 0.55)`;
}

/** Relevance used for "প্রাসঙ্গিকতা": trigram similarity plus exact title hits. */
function relevanceExpr(q: string): SQL {
  const whole = normalizeQuery(q);
  const toks = tokens(q);
  const hits = toks.length
    ? sql.join(
        toks.map((tk) => sql`(case when ${circulars.searchText} ilike ${`%${tk}%`} then 0.2 else 0 end)`),
        sql` + `,
      )
    : sql`0`;
  return sql`(word_similarity(${whole}, ${circulars.searchText}) + (case when lower(${circulars.titleBn}) like ${`%${whole}%`} or lower(${circulars.titleEn}) like ${`%${whole}%`} then 1 else 0 end) + ${hits})::float8`;
}

type WhereOpts = { skip?: FacetKey | keyof JobFilters; eligibleIds?: string[] | null };

/** All conditions for a filter set (optionally leaving one filter out, for facets). */
function buildWhere(f: JobFilters, now: number, opts: WhereOpts = {}): SQL {
  const skip = opts.skip;
  const conds: (SQL | undefined)[] = [isPublicCircular];
  const end = circulars.applicationEndAt;
  const start = circulars.applicationStartAt;

  const status = skip === "status" ? undefined : f.status;
  if (status?.length) {
    const parts: SQL[] = [];
    if (status.includes("open")) parts.push(sql`(${start} <= ${ts(now)} and ${end} > ${ts(now)})`);
    if (status.includes("upcoming")) parts.push(sql`${start} > ${ts(now)}`);
    conds.push(sql`(${sql.join(parts, sql` or `)})`);
  } else {
    conds.push(sql`${end} > ${ts(now)}`);
  }

  if (skip !== "q" && f.q?.trim()) conds.push(textCondition(f.q));
  if (skip !== "division" && f.division?.length) conds.push(inArray(circulars.divisionId, f.division));
  if (skip !== "district" && f.district?.length) conds.push(inArray(circulars.districtId, f.district));
  if (skip !== "sector" && f.sector?.length) conds.push(inArray(circulars.sector, f.sector));
  if (skip !== "category" && f.category?.length) conds.push(inArray(circulars.categoryId, f.category));
  if (skip !== "organization" && f.organization?.length) conds.push(inArray(circulars.organizationId, f.organization));
  if (skip !== "jobType" && f.jobType?.length) conds.push(inArray(circulars.jobType, f.jobType));
  if (skip !== "workMode" && f.workMode?.length) conds.push(inArray(circulars.workMode, f.workMode));
  if (skip !== "education" && f.education?.length) {
    conds.push(
      sql`exists (select 1 from ${circularPosts} p where p.circular_id = ${circulars.id} and p.min_education_level::text in ${f.education})`,
    );
  }
  if (skip !== "salaryMin" && f.salaryMin != null) conds.push(sql`${circulars.maxSalary} >= ${f.salaryMin}`);
  if (skip !== "salaryMax" && f.salaryMax != null) conds.push(sql`${circulars.minSalary} <= ${f.salaryMax}`);
  if (skip !== "deadlineWithin" && f.deadlineWithin) conds.push(deadlineCond(f.deadlineWithin, now));
  if (skip !== "eligibleOnly" && opts.eligibleIds) {
    conds.push(opts.eligibleIds.length ? inArray(circulars.id, opts.eligibleIds) : sql`false`);
  }
  return and(...conds)!;
}

function deadlineCond(w: "today" | "3d" | "7d", now: number): SQL {
  const end = circulars.applicationEndAt;
  if (w === "today") {
    return sql`(${end} > ${ts(now)} and (${end} at time zone 'Asia/Dhaka')::date = ${dhakaDateKey(now)}::date)`;
  }
  return sql`(${end} > ${ts(now)} and ${end} <= ${ts(now + (w === "3d" ? 3 : 7) * DAY)})`;
}

// ───────── eligibility pre-filter (same function as the panel) ─────────

/**
 * Ids of open/upcoming circulars where at least one post is not "not eligible" for the user.
 * Computed with `computeEligibility` itself, so the filter and the panel always agree.
 */
async function eligibleCircularIds(db: DbOrTx, userId: string, now: number): Promise<string[]> {
  const profile = await loadProfile(db, userId, "");
  const list = await loadCirculars(db, and(isPublicCircular, sql`${circulars.applicationEndAt} > ${ts(now)}`), now);
  return list
    .filter((c) =>
      c.posts.some((p) =>
        passesEligibleOnly(
          computeEligibility(
            { startAt: c.startAt, endAt: c.endAt, ageReferenceDate: c.ageReferenceDate, publishedOn: c.publishedAt?.slice(0, 10) ?? null },
            p,
            profile,
            now,
            districtById,
          ),
        ),
      ),
    )
    .map((c) => c.id);
}

async function whereFor(ctx: Ctx, db: DbOrTx, f: JobFilters, now: number, skip?: WhereOpts["skip"]): Promise<SQL> {
  const eligibleIds = f.eligibleOnly && ctx.actor.kind === "user" && skip !== "eligibleOnly" ? await eligibleCircularIds(db, ctx.actor.userId, now) : null;
  return buildWhere(f, now, { skip, eligibleIds });
}

async function bookmarkedPostIds(ctx: Ctx, db: DbOrTx, postIds?: string[]): Promise<Set<string>> {
  if (ctx.actor.kind !== "user") return new Set();
  const rows = await db
    .select({ postId: bookmarks.circularPostId })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, ctx.actor.userId), postIds ? (postIds.length ? inArray(bookmarks.circularPostId, postIds) : sql`false`) : undefined));
  return new Set(rows.map((r) => r.postId));
}

async function toItems(ctx: Ctx, db: DbOrTx, ids: string[], now: number): Promise<CircularListItem[]> {
  const list = await loadCircularsByIds(db, ids, now);
  const bm = await bookmarkedPostIds(ctx, db, list.flatMap((c) => c.posts.map((p) => p.id)));
  return list.map((c) => toListItem(c, bm));
}

// ───────── sorting & keyset pagination ─────────

type SortSpec = { key: SQL; dir: "asc" | "desc"; kind: "time" | "num" };

function sortSpec(f: JobFilters): SortSpec {
  const sort = f.sort ?? (f.q?.trim() ? "relevance" : "deadline");
  switch (sort) {
    case "newest":
      return { key: sql`coalesce(${circulars.publishedAt}, ${circulars.createdAt})`, dir: "desc", kind: "time" };
    case "salary":
      return { key: sql`coalesce(${circulars.maxSalary}, -1)`, dir: "desc", kind: "num" };
    case "vacancies":
      return { key: sql`${circulars.totalVacancies}`, dir: "desc", kind: "num" };
    case "relevance":
      return f.q?.trim()
        ? { key: relevanceExpr(f.q), dir: "desc", kind: "num" }
        : { key: sql`${circulars.applicationEndAt}`, dir: "asc", kind: "time" };
    default:
      return { key: sql`${circulars.applicationEndAt}`, dir: "asc", kind: "time" };
  }
}

type CursorData = { v: string | number; id: string };

export function encodeCursor(c: CursorData): string {
  return Buffer.from(JSON.stringify([c.v, c.id])).toString("base64url");
}

export function decodeCursor(s: string | null): CursorData | null {
  if (!s) return null;
  try {
    const [v, id] = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as [string | number, string];
    if ((typeof v !== "string" && typeof v !== "number") || typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return { v, id };
  } catch {
    return null;
  }
}

function afterCursor(spec: SortSpec, c: CursorData): SQL {
  const v = spec.kind === "time" ? sql`${String(c.v)}::timestamptz` : sql`${Number(c.v)}::float8`;
  const cmp = spec.dir === "asc" ? sql`>` : sql`<`;
  return sql`((${spec.key}) ${cmp} ${v} or ((${spec.key}) = ${v} and ${circulars.id} > ${c.id}::uuid))`;
}

// ───────── public API ─────────

export async function getTaxonomy(_ctx: Ctx, db: DbOrTx): Promise<Taxonomy> {
  const orgs = await db
    .select()
    .from(organizations)
    .where(sql`${organizations.deletedAt} is null`)
    .orderBy(asc(organizations.nameBn));
  return {
    divisions,
    districts,
    categories,
    tags: tagList,
    organizations: orgs.map((o) => ({ id: o.id, slug: o.slug, nameBn: o.nameBn, nameEn: o.nameEn, shortName: o.shortName, verified: o.verified, type: o.type })),
  };
}

export async function listCirculars(ctx: Ctx, db: DbOrTx, f: JobFilters, cursor: string | null): Promise<Page<CircularListItem>> {
  authorize(ctx.actor, "circular.browse");
  const now = ctx.now();
  const where = await whereFor(ctx, db, f, now);
  const spec = sortSpec(f);
  const cur = decodeCursor(cursor);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ id: circulars.id, k: sql<string | number>`(${spec.key})` })
      .from(circulars)
      .where(cur ? and(where, afterCursor(spec, cur)) : where)
      .orderBy(spec.dir === "asc" ? asc(spec.key) : desc(spec.key), asc(circulars.id))
      .limit(PAGE_SIZE + 1),
    db.select({ n: sql<number>`count(*)::int` }).from(circulars).where(where),
  ]);
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > PAGE_SIZE && last
      ? encodeCursor({ v: spec.kind === "time" ? new Date(last.k as string).toISOString() : Number(last.k), id: last.id })
      : null;
  return { items: await toItems(ctx, db, page.map((r) => r.id), now), nextCursor, total: Number(n) };
}

/** Log one search (no raw IP; user id only when signed in). */
export async function logSearch(ctx: Ctx, db: DbOrTx, query: string, filters: JobFilters, mode: "normal" | "ai" | "ai_fallback", resultCount: number) {
  const q = normalizeQuery(query);
  if (!q) return;
  await db.insert(searchLogs).values({
    normalizedQuery: q,
    parsedFilters: filters,
    mode,
    resultCount,
    userId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
  });
}

const SECTORS = ["government", "semi_government", "autonomous", "private", "ngo", "international"] as const;
const JOB_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
const WORK_MODES = ["onsite", "remote", "hybrid"] as const;

async function countBy(db: DbOrTx, column: SQL, where: SQL): Promise<Map<string, number>> {
  const rows = await db
    .select({ k: sql<string>`(${column})::text`, n: sql<number>`count(*)::int` })
    .from(circulars)
    .where(where)
    .groupBy(sql`1`);
  return new Map(rows.map((r) => [r.k, Number(r.n)]));
}

/** Facet counts for the current filter set; each facet ignores its own selection. */
export async function getFacets(ctx: Ctx, db: DbOrTx, f: JobFilters): Promise<Facets> {
  authorize(ctx.actor, "circular.browse");
  const now = ctx.now();
  const w = (skip?: FacetKey) => whereFor(ctx, db, f, now, skip);
  const keep = (opts: FacetOption[], selected: string[] | undefined) => opts.filter((o) => o.count > 0 || selected?.includes(o.value));

  const [whereAll, wDiv, wDis, wSec, wCat, wOrg, wJob, wMode, wEdu, wDeadline, wStatus] = await Promise.all([
    w(),
    w("division"),
    w("district"),
    w("sector"),
    w("category"),
    w("organization"),
    w("jobType"),
    w("workMode"),
    w("education"),
    w("deadlineWithin"),
    w("status"),
  ]);

  const [total, byDiv, byDis, bySec, byCat, byOrg, byJob, byMode, eduRows, deadlineRow, statusRow, orgRows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(circulars).where(whereAll),
    countBy(db, sql`${circulars.divisionId}`, wDiv),
    countBy(db, sql`${circulars.districtId}`, wDis),
    countBy(db, sql`${circulars.sector}`, wSec),
    countBy(db, sql`${circulars.categoryId}`, wCat),
    countBy(db, sql`${circulars.organizationId}`, wOrg),
    countBy(db, sql`${circulars.jobType}`, wJob),
    countBy(db, sql`${circulars.workMode}`, wMode),
    db
      .select({ k: sql<string>`${circularPosts.minEducationLevel}::text`, n: sql<number>`count(distinct ${circulars.id})::int` })
      .from(circulars)
      .innerJoin(circularPosts, eq(circularPosts.circularId, circulars.id))
      .where(wEdu)
      .groupBy(sql`1`),
    db
      .select({
        today: sql<number>`count(*) filter (where ${deadlineCond("today", now)})::int`,
        d3: sql<number>`count(*) filter (where ${deadlineCond("3d", now)})::int`,
        d7: sql<number>`count(*) filter (where ${deadlineCond("7d", now)})::int`,
      })
      .from(circulars)
      .where(wDeadline),
    db
      .select({
        open: sql<number>`count(*) filter (where ${circulars.applicationStartAt} <= ${ts(now)} and ${circulars.applicationEndAt} > ${ts(now)})::int`,
        upcoming: sql<number>`count(*) filter (where ${circulars.applicationStartAt} > ${ts(now)})::int`,
      })
      .from(circulars)
      .where(and(wStatus, sql`${circulars.applicationEndAt} > ${ts(now)}`)),
    db.select({ id: organizations.id, nameBn: organizations.nameBn }).from(organizations).where(sql`${organizations.deletedAt} is null`),
  ]);
  const edu = new Map(eduRows.map((r) => [r.k, Number(r.n)]));
  const d = deadlineRow[0];
  const s = statusRow[0];
  return {
    total: Number(total[0].n),
    division: divisions.map((x) => ({ value: x.id, labelBn: x.nameBn, count: byDiv.get(x.id) ?? 0 })),
    district: keep(
      districts.map((x) => ({ value: x.id, labelBn: x.nameBn, count: byDis.get(x.id) ?? 0 })),
      f.district,
    ).sort((a, b) => b.count - a.count),
    sector: keep(
      SECTORS.map((x) => ({ value: x, labelBn: t(`enums.sector.${x}`), count: bySec.get(x) ?? 0 })),
      f.sector,
    ),
    category: categories.map((x) => ({ value: x.id, labelBn: x.nameBn, count: byCat.get(x.id) ?? 0 })),
    organization: keep(
      orgRows.map((o) => ({ value: o.id, labelBn: o.nameBn, count: byOrg.get(o.id) ?? 0 })),
      f.organization,
    ).sort((a, b) => b.count - a.count),
    education: EDUCATION_LEVELS.map((e) => ({ value: e, labelBn: t(`enums.education.${e}`), count: edu.get(e) ?? 0 })),
    jobType: JOB_TYPES.map((x) => ({ value: x, labelBn: t(`enums.jobType.${x}`), count: byJob.get(x) ?? 0 })),
    workMode: WORK_MODES.map((x) => ({ value: x, labelBn: t(`enums.workMode.${x}`), count: byMode.get(x) ?? 0 })),
    deadlineWithin: [
      { value: "today", labelBn: t("enums.deadlineWithin.today"), count: Number(d.today) },
      { value: "3d", labelBn: t("enums.deadlineWithin.3d"), count: Number(d.d3) },
      { value: "7d", labelBn: t("enums.deadlineWithin.7d"), count: Number(d.d7) },
    ],
    status: [
      { value: "open", labelBn: t("common.open"), count: Number(s.open) },
      { value: "upcoming", labelBn: t("common.upcoming"), count: Number(s.upcoming) },
    ],
  };
}

/** Bangla label of one filter value (chips and suggestions). */
function filterLabel(key: keyof JobFilters, value: string, orgNames: Map<string, string>): string {
  switch (key) {
    case "division":
      return divisions.find((d) => d.id === value)?.nameBn ?? value;
    case "district":
      return districtById.get(value)?.nameBn ?? value;
    case "category":
      return categories.find((c) => c.id === value)?.nameBn ?? value;
    case "organization":
      return orgNames.get(value) ?? value;
    case "sector":
      return t(`enums.sector.${value as (typeof SECTORS)[number]}`);
    case "education":
      return t(`enums.education.${value as (typeof EDUCATION_LEVELS)[number]}`);
    case "jobType":
      return t(`enums.jobType.${value as (typeof JOB_TYPES)[number]}`);
    case "workMode":
      return t(`enums.workMode.${value as (typeof WORK_MODES)[number]}`);
    case "deadlineWithin":
      return t(`enums.deadlineWithin.${value as "today" | "3d" | "7d"}`);
    case "status":
      return t(value === "open" ? "common.open" : "common.upcoming");
    case "salaryMin":
      return `৳${Number(value).toLocaleString("bn-BD")}+`;
    case "salaryMax":
      return `≤ ৳${Number(value).toLocaleString("bn-BD")}`;
    case "eligibleOnly":
      return t("jobs.eligibleOnly");
    case "q":
      return `“${value}”`;
    default:
      return value;
  }
}

/** For each active filter: how many results without it? (spec §5.1) */
export async function getZeroResultSuggestions(ctx: Ctx, db: DbOrTx, f: JobFilters): Promise<ZeroResultSuggestion[]> {
  authorize(ctx.actor, "circular.browse");
  const now = ctx.now();
  const orgNames = new Map((await db.select({ id: organizations.id, n: organizations.nameBn }).from(organizations)).map((o) => [o.id, o.n]));
  const tasks: Promise<ZeroResultSuggestion>[] = [];
  const count = async (next: JobFilters) => {
    const where = await whereFor(ctx, db, next, now);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(circulars).where(where);
    return Number(n);
  };
  const arrayKeys = ["division", "district", "sector", "category", "organization", "education", "jobType", "workMode", "status"] as const;
  for (const key of arrayKeys) {
    for (const value of (f[key] as string[] | undefined) ?? []) {
      const next = { ...f, [key]: (f[key] as string[]).filter((v) => v !== value) };
      tasks.push(count(next).then((resultCount) => ({ key, value, labelBn: filterLabel(key, value, orgNames), resultCount })));
    }
  }
  for (const key of ["q", "salaryMin", "salaryMax", "deadlineWithin", "eligibleOnly"] as const) {
    const v = f[key];
    if (v == null || v === "" || v === false) continue;
    tasks.push(count({ ...f, [key]: undefined }).then((resultCount) => ({ key, value: null, labelBn: filterLabel(key, String(v), orgNames), resultCount })));
  }
  const out = await Promise.all(tasks);
  return out.filter((s) => s.resultCount > 0).sort((a, b) => b.resultCount - a.resultCount);
}

/** Rule-based query understanding (Part 3 puts the AI in front). Logged to search_logs. */
export async function parseSearchQuery(ctx: Ctx, db: DbOrTx, text: string): Promise<ParsedSearch> {
  authorize(ctx.actor, "circular.browse");
  const parsed = parseQueryRules(text, { districts, divisions, categories });
  const result: ParsedSearch = { ...parsed, mode: "fallback" };
  const where = await whereFor(ctx, db, parsed.filters, ctx.now());
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(circulars).where(where);
  await logSearch(ctx, db, text, parsed.filters, "ai_fallback", Number(n));
  return result;
}

/** Count once per visitor per day (views and apply clicks). Returns whether it counted. */
async function bumpCounter(ctx: Ctx, db: DbOrTx, circularId: string, kind: "view" | "apply"): Promise<boolean> {
  const inserted = await db
    .insert(circularCounterDedupe)
    .values({ circularId, kind, visitorHash: ctx.visitorKey, day: dhakaDateKey(ctx.now()) })
    .onConflictDoNothing()
    .returning({ c: circularCounterDedupe.circularId });
  if (inserted.length === 0) return false;
  await db
    .update(circulars)
    .set(kind === "view" ? { views: sql`${circulars.views} + 1` } : { applyClicks: sql`${circulars.applyClicks} + 1` })
    .where(eq(circulars.id, circularId));
  return true;
}

export async function getCircular(ctx: Ctx, db: DbOrTx, slug: string): Promise<CircularDetail> {
  authorize(ctx.actor, "circular.browse");
  const now = ctx.now();
  const staff = ctx.actor.kind === "user" && (ctx.actor.role === "admin" || ctx.actor.role === "moderator");
  const [c] = await loadCirculars(db, staff ? eq(circulars.slug, slug) : and(eq(circulars.slug, slug), isPublicCircular), now);
  if (!c) throw new AppError("NOT_FOUND");
  if (c.status === "published" || c.status === "closed") await bumpCounter(ctx, db, c.id, "view");

  const similarIds = await db
    .select({ id: circulars.id })
    .from(circulars)
    .where(and(isPublicCircular, sql`${circulars.id} <> ${c.id}`, sql`${circulars.applicationEndAt} > ${ts(now)}`))
    .orderBy(sql`case when ${circulars.categoryId} = ${c.categoryId} then 0 else 1 end`, asc(circulars.applicationEndAt))
    .limit(3);
  const postIds = c.posts.map((p) => p.id);
  const bm = await bookmarkedPostIds(ctx, db, postIds);
  let trackedPosts: Record<string, string> = {};
  if (ctx.actor.kind === "user" && postIds.length) {
    const apps = await db
      .select({ id: applications.id, postId: applications.circularPostId })
      .from(applications)
      .where(and(eq(applications.userId, ctx.actor.userId), inArray(applications.circularPostId, postIds)));
    trackedPosts = Object.fromEntries(apps.map((a) => [a.postId, a.id]));
  }
  return {
    circular: c,
    similar: await toItems(ctx, db, similarIds.map((r) => r.id), now),
    bookmarkedPostIds: [...bm],
    trackedPosts,
  };
}

/** Apply-button click; counted once per user (or session) per day. */
export async function recordApplyClick(ctx: Ctx, db: DbOrTx, circularId: string): Promise<{ counted: boolean }> {
  authorize(ctx.actor, "circular.browse");
  const [c] = await db.select({ id: circulars.id }).from(circulars).where(and(eq(circulars.id, circularId), isPublicCircular));
  if (!c) throw new AppError("NOT_FOUND");
  return { counted: await bumpCounter(ctx, db, circularId, "apply") };
}

async function orgCounts(db: DbOrTx, now: number) {
  const rows = await db
    .select({
      orgId: circulars.organizationId,
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${circulars.applicationEndAt} > ${ts(now)})::int`,
    })
    .from(circulars)
    .where(isPublicCircular)
    .groupBy(circulars.organizationId);
  return new Map(rows.map((r) => [r.orgId, { total: Number(r.total), open: Number(r.open) }]));
}

export function toOrganization(o: typeof organizations.$inferSelect, counts?: { total: number; open: number }): Organization {
  return {
    id: o.id,
    slug: o.slug,
    nameBn: o.nameBn,
    nameEn: o.nameEn,
    shortName: o.shortName,
    type: o.type,
    verified: o.verified,
    website: o.website,
    openCircularCount: counts?.open ?? 0,
    totalCircularCount: counts?.total ?? 0,
    version: o.version,
    updatedAt: o.updatedAt.toISOString(),
  };
}

export async function listOrganizations(ctx: Ctx, db: DbOrTx): Promise<Organization[]> {
  authorize(ctx.actor, "circular.browse");
  const [orgs, counts] = await Promise.all([
    db.select().from(organizations).where(sql`${organizations.deletedAt} is null`).orderBy(asc(organizations.nameBn)),
    orgCounts(db, ctx.now()),
  ]);
  return orgs.map((o) => toOrganization(o, counts.get(o.id)));
}

export async function getOrganization(ctx: Ctx, db: DbOrTx, slug: string): Promise<OrganizationDetail> {
  authorize(ctx.actor, "circular.browse");
  const now = ctx.now();
  const [o] = await db.select().from(organizations).where(and(eq(organizations.slug, slug), sql`${organizations.deletedAt} is null`));
  if (!o) throw new AppError("NOT_FOUND");
  const list = await loadCirculars(db, and(eq(circulars.organizationId, o.id), isPublicCircular), now);
  const bm = await bookmarkedPostIds(ctx, db, list.flatMap((c) => c.posts.map((p) => p.id)));
  const open = list.filter((c) => new Date(c.endAt).getTime() > now).sort((a, b) => a.endAt.localeCompare(b.endAt));
  const past = list.filter((c) => new Date(c.endAt).getTime() <= now).sort((a, b) => b.endAt.localeCompare(a.endAt));
  return {
    organization: toOrganization(o, { total: list.length, open: open.length }),
    open: open.map((c) => toListItem(c, bm)),
    past: past.map((c) => toListItem(c, bm)),
  };
}

export async function getLandingStats(ctx: Ctx, db: DbOrTx): Promise<LandingStats> {
  authorize(ctx.actor, "circular.browse");
  const now = ctx.now();
  const open = and(isPublicCircular, sql`${circulars.applicationEndAt} > ${ts(now)}`)!;
  const [[agg], byCat, byDiv, todayIds] = await Promise.all([
    db
      .select({
        openCirculars: sql<number>`count(*)::int`,
        totalVacancies: sql<number>`coalesce(sum(${circulars.totalVacancies}), 0)::int`,
        closingToday: sql<number>`count(*) filter (where ${deadlineCond("today", now)})::int`,
      })
      .from(circulars)
      .where(open),
    countBy(db, sql`${circulars.categoryId}`, open),
    countBy(db, sql`${circulars.divisionId}`, open),
    db.select({ id: circulars.id }).from(circulars).where(and(open, deadlineCond("today", now))).orderBy(asc(circulars.applicationEndAt)).limit(12),
  ]);
  return {
    openCirculars: Number(agg.openCirculars),
    totalVacancies: Number(agg.totalVacancies),
    closingToday: Number(agg.closingToday),
    closingTodayJobs: await toItems(ctx, db, todayIds.map((r) => r.id), now),
    categories: categories.map((c) => ({ id: c.id, slug: c.slug, nameBn: c.nameBn, icon: c.icon, count: byCat.get(c.id) ?? 0 })),
    divisions: divisions.map((d) => ({ id: d.id, slug: d.slug, nameBn: d.nameBn, count: byDiv.get(d.id) ?? 0 })),
  };
}

export async function reportCircularError(ctx: Ctx, tx: Tx, circularId: string, message: string): Promise<{ received: true }> {
  authorize(ctx.actor, "circular.browse");
  const [c] = await tx.select({ id: circulars.id }).from(circulars).where(and(eq(circulars.id, circularId), isPublicCircular));
  if (!c) throw new AppError("NOT_FOUND");
  await tx.insert(circularReports).values({ circularId, message, userId: ctx.actor.kind === "user" ? ctx.actor.userId : null });
  return { received: true };
}

// ───────── eligibility ─────────

export async function checkEligibility(ctx: Ctx, db: DbOrTx, postId: string): Promise<EligibilityResult> {
  const userId = requireUser(ctx.actor);
  const profile = await loadProfile(db, userId, "");
  if (!profile.onboardingCompleted) throw new AppError("PROFILE_INCOMPLETE");
  const [row] = await db.select({ circularId: circularPosts.circularId }).from(circularPosts).where(eq(circularPosts.id, postId));
  if (!row) throw new AppError("NOT_FOUND");
  const [c] = await loadCirculars(db, and(eq(circulars.id, row.circularId), isPublicCircular), ctx.now());
  const post = c?.posts.find((p) => p.id === postId);
  if (!c || !post) throw new AppError("NOT_FOUND");
  return computeEligibility(
    { startAt: c.startAt, endAt: c.endAt, ageReferenceDate: c.ageReferenceDate, publishedOn: c.publishedAt?.slice(0, 10) ?? null },
    post,
    profile,
    ctx.now(),
    districtById,
  );
}

// ───────── bookmarks ─────────

export async function toggleBookmark(ctx: Ctx, tx: Tx, postId: string): Promise<{ bookmarked: boolean }> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const removed = await tx
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.circularPostId, postId)))
    .returning({ id: bookmarks.id });
  if (removed.length) return { bookmarked: false };
  const [post] = await tx
    .select({ id: circularPosts.id })
    .from(circularPosts)
    .innerJoin(circulars, eq(circulars.id, circularPosts.circularId))
    .where(and(eq(circularPosts.id, postId), isPublicCircular));
  if (!post) throw new AppError("NOT_FOUND");
  await tx.insert(bookmarks).values({ userId, circularPostId: postId });
  return { bookmarked: true };
}

export async function listBookmarks(ctx: Ctx, db: DbOrTx): Promise<(Bookmark & { job: CircularListItem })[]> {
  const userId = requireUser(ctx.actor);
  const rows = await db
    .select({ id: bookmarks.id, postId: bookmarks.circularPostId, circularId: circularPosts.circularId, createdAt: bookmarks.createdAt })
    .from(bookmarks)
    .innerJoin(circularPosts, eq(circularPosts.id, bookmarks.circularPostId))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt));
  const list = await loadCircularsByIds(db, [...new Set(rows.map((r) => r.circularId))], ctx.now());
  const byId = new Map(list.map((c) => [c.id, c]));
  const set = new Set(rows.map((r) => r.postId));
  return rows
    .filter((r) => byId.has(r.circularId))
    .map((r) => ({ id: r.id, postId: r.postId, circularId: r.circularId, createdAt: r.createdAt.toISOString(), job: toListItem(byId.get(r.circularId)!, set) }));
}

// ───────── saved searches ─────────

async function newMatchCount(ctx: Ctx, db: DbOrTx, filters: JobFilters, since: Date): Promise<number> {
  const where = await whereFor(ctx, db, filters, ctx.now());
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(circulars)
    .where(and(where, sql`coalesce(${circulars.publishedAt}, ${circulars.createdAt}) > ${since.toISOString()}::timestamptz`));
  return Number(n);
}

async function toSavedSearch(ctx: Ctx, db: DbOrTx, s: typeof savedSearches.$inferSelect): Promise<SavedSearch> {
  return {
    id: s.id,
    name: s.name,
    filters: s.filters,
    alertEnabled: s.alertEnabled,
    newMatchCount: await newMatchCount(ctx, db, s.filters, s.lastNotifiedAt ?? s.createdAt),
    createdAt: s.createdAt.toISOString(),
  };
}

export async function listSavedSearches(ctx: Ctx, db: DbOrTx): Promise<SavedSearch[]> {
  const userId = requireUser(ctx.actor);
  const rows = await db.select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(desc(savedSearches.createdAt));
  return Promise.all(rows.map((s) => toSavedSearch(ctx, db, s)));
}

export async function saveSearch(ctx: Ctx, tx: Tx, name: string, filters: JobFilters): Promise<SavedSearch> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(savedSearches).where(eq(savedSearches.userId, userId));
  if (Number(n) >= 20) throw new AppError("VALIDATION", { message_bn: "সর্বোচ্চ ২০টি সার্চ সেভ করা যায়।" });
  const [row] = await tx.insert(savedSearches).values({ userId, name, filters, lastNotifiedAt: new Date(ctx.now()) }).returning();
  return toSavedSearch(ctx, tx, row);
}

async function ownSavedSearch(ctx: Ctx, db: DbOrTx, id: string) {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const [row] = await db.select().from(savedSearches).where(eq(savedSearches.id, id));
  if (!row || row.userId !== userId) throw new AppError("NOT_FOUND");
  return row;
}

export async function setSavedSearchAlert(ctx: Ctx, tx: Tx, id: string, enabled: boolean): Promise<SavedSearch> {
  await ownSavedSearch(ctx, tx, id);
  const [row] = await tx.update(savedSearches).set({ alertEnabled: enabled, updatedAt: new Date() }).where(eq(savedSearches.id, id)).returning();
  return toSavedSearch(ctx, tx, row);
}

export async function deleteSavedSearch(ctx: Ctx, tx: Tx, id: string): Promise<{ id: string }> {
  await ownSavedSearch(ctx, tx, id);
  await tx.delete(savedSearches).where(eq(savedSearches.id, id));
  return { id };
}

export { iso, PAGE_SIZE };
