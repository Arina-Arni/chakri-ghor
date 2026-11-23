import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { dhakaDateKey, dhakaToUtc } from "@/domain/bn";
import { computeEligibility } from "@/domain/eligibility";
import { matchScore } from "@/domain/matching";
import { categories, districtById, divisions } from "@/domain/taxonomy";
import { t } from "@/i18n";
import type { ApplicationStatus, DashboardStats, SeekerDashboard } from "@/types";
import { authorize, requireUser } from "@/server/authz";
import type { Ctx } from "@/server/context";
import type { DbOrTx } from "@/server/db/client";
import { isPublicCircular, loadCirculars, toListItem } from "@/server/db/queries/circulars";
import { applications, bookmarks, circularPosts, circulars, profiles, searchLogs } from "@/server/db/schema";
import { listSavedSearches } from "./discovery";
import { loadProfile } from "./profile";

const DAY = 86_400_000;
const ts = (ms: number) => sql`${new Date(ms).toISOString()}::timestamptz`;

// ───────── seeker ─────────

export async function getSeekerDashboard(ctx: Ctx, db: DbOrTx): Promise<SeekerDashboard> {
  const userId = requireUser(ctx.actor);
  const now = ctx.now();
  const profile = await loadProfile(db, userId, "");

  const [byStatus, [counts], exams, watchedRows] = await Promise.all([
    db
      .select({ status: applications.status, n: sql<number>`count(*)::int` })
      .from(applications)
      .where(eq(applications.userId, userId))
      .groupBy(applications.status),
    db
      .select({
        saved: sql<number>`(select count(*)::int from ${bookmarks} b where b.user_id = ${userId})`,
        applied: sql<number>`count(*) filter (where ${applications.status} not in ('saved','preparing','withdrawn'))::int`,
        upcomingExams: sql<number>`count(*) filter (where ${applications.examAt} > ${ts(now)})::int`,
      })
      .from(applications)
      .where(eq(applications.userId, userId)),
    db
      .select({ id: applications.id, examAt: applications.examAt, venue: applications.examVenue, title: circularPosts.titleBn })
      .from(applications)
      .innerJoin(circularPosts, eq(circularPosts.id, applications.circularPostId))
      .where(and(eq(applications.userId, userId), isNotNull(applications.examAt), sql`${applications.examAt} > ${ts(now)}`))
      .orderBy(asc(applications.examAt)),
    // Circulars the user follows (bookmarked or tracked) that close within 7 days.
    db
      .selectDistinct({ id: circulars.id, endAt: circulars.applicationEndAt })
      .from(circulars)
      .innerJoin(circularPosts, eq(circularPosts.circularId, circulars.id))
      .where(
        and(
          isPublicCircular,
          sql`${circulars.applicationEndAt} > ${ts(now)} and ${circulars.applicationEndAt} <= ${ts(now + 7 * DAY)}`,
          sql`(exists (select 1 from ${bookmarks} b where b.user_id = ${userId} and b.circular_post_id = ${circularPosts.id})
            or exists (select 1 from ${applications} a where a.user_id = ${userId} and a.circular_post_id = ${circularPosts.id}))`,
        ),
      )
      .orderBy(asc(circulars.applicationEndAt)),
  ]);

  const bmRows = await db.select({ postId: bookmarks.circularPostId }).from(bookmarks).where(eq(bookmarks.userId, userId));
  const bm = new Set(bmRows.map((r) => r.postId));

  const open = await loadCirculars(db, and(isPublicCircular, sql`${circulars.applicationEndAt} > ${ts(now)}`), now);
  const watched = new Set(watchedRows.map((r) => r.id));
  const closingThisWeek = open.filter((c) => watched.has(c.id)).sort((a, b) => a.endAt.localeCompare(b.endAt)).map((c) => toListItem(c, bm));

  const recommended = open
    .map((c) => {
      const eligible = c.posts.some(
        (p) =>
          computeEligibility(
            { startAt: c.startAt, endAt: c.endAt, ageReferenceDate: c.ageReferenceDate, publishedOn: c.publishedAt?.slice(0, 10) ?? null },
            p,
            profile,
            now,
            districtById,
          ).verdict === "eligible",
      );
      const s = matchScore(
        {
          eligible,
          circularDistrictIds: [c.districtId, ...c.posts.flatMap((p) => p.eligibleDistrictIds ?? [])].filter((x): x is string => Boolean(x)),
          categoryId: c.categoryId,
          keywords: c.posts.flatMap((p) => p.keywordsRequired),
          endAt: c.endAt,
        },
        { homeDistrictId: profile.homeDistrictId, preferredDistrictIds: profile.preferences.districtIds, preferredCategoryIds: profile.preferences.categoryIds, skills: profile.skills },
        now,
      );
      return { c, s };
    })
    .filter((x) => x.s.score >= 45)
    .sort((a, b) => b.s.score - a.s.score || a.c.endAt.localeCompare(b.c.endAt))
    .slice(0, 4)
    .map(({ c, s }) => ({ ...toListItem(c, bm), reasonsBn: s.reasonsBn }));

  return {
    greetingName: profile.fullName.split(/\s+/)[0] || "",
    profileCompleteness: profile.completeness,
    missingItems: profile.missingItems,
    stats: { saved: Number(counts?.saved ?? 0), applied: Number(counts?.applied ?? 0), upcomingExams: Number(counts?.upcomingExams ?? 0) },
    closingThisWeek,
    upcomingExams: exams.map((e) => ({ applicationId: e.id, jobTitleBn: e.title, examAt: e.examAt!.toISOString(), venue: e.venue })),
    applicationsByStatus: byStatus.map((r) => ({ status: r.status, labelBn: t(`enums.applicationStatus.${r.status as ApplicationStatus}`), count: Number(r.n) })),
    recommended,
    savedSearches: await listSavedSearches(ctx, db),
  };
}

// ───────── admin ─────────

const CACHE_MS = 60_000;
let adminCache: { at: number; value: DashboardStats } | null = null;

/** Clear the 60 s cache (tests, and after big admin changes). */
export function invalidateAdminDashboard(): void {
  adminCache = null;
}

export async function getAdminDashboard(ctx: Ctx, db: DbOrTx): Promise<DashboardStats> {
  authorize(ctx.actor, "admin.dashboard");
  const now = ctx.now();
  if (adminCache && now - adminCache.at < CACHE_MS) return adminCache.value;
  const value = await computeAdminDashboard(db, now);
  adminCache = { at: now, value };
  return value;
}

/** Every number from SQL aggregates (spec §5.6). Exported for exact-number tests. */
export async function computeAdminDashboard(db: DbOrTx, now: number): Promise<DashboardStats> {
  const today = dhakaDateKey(now);
  const days = Array.from({ length: 7 }, (_, i) => dhakaDateKey(now - (6 - i) * DAY));
  const since = dhakaToUtc(days[0], "00:00");
  const open = and(isPublicCircular, sql`${circulars.applicationEndAt} > ${ts(now)}`);

  const [[agg], byCat, byDiv, signups, top, zero, modes] = await Promise.all([
    db
      .select({
        openCirculars: sql<number>`count(*) filter (where ${circulars.status} in ('published','closed') and ${circulars.applicationEndAt} > ${ts(now)})::int`,
        openVacancies: sql<number>`coalesce(sum(${circulars.totalVacancies}) filter (where ${circulars.status} in ('published','closed') and ${circulars.applicationEndAt} > ${ts(now)}), 0)::int`,
        closingToday: sql<number>`count(*) filter (where ${circulars.status} in ('published','closed') and ${circulars.applicationEndAt} > ${ts(now)} and (${circulars.applicationEndAt} at time zone 'Asia/Dhaka')::date = ${today}::date)::int`,
        publishedToday: sql<number>`count(*) filter (where ${circulars.publishedAt} is not null and (${circulars.publishedAt} at time zone 'Asia/Dhaka')::date = ${today}::date)::int`,
        reviewPending: sql<number>`count(*) filter (where ${circulars.status} = 'pending_review')::int`,
      })
      .from(circulars)
      .where(sql`${circulars.deletedAt} is null`),
    db.select({ k: circulars.categoryId, n: sql<number>`count(*)::int` }).from(circulars).where(open).groupBy(circulars.categoryId),
    db.select({ k: circulars.divisionId, n: sql<number>`count(*)::int` }).from(circulars).where(open).groupBy(circulars.divisionId),
    db
      .select({ d: sql<string>`to_char((${profiles.createdAt} at time zone 'Asia/Dhaka')::date, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(profiles)
      .where(gte(profiles.createdAt, since))
      .groupBy(sql`1`),
    db
      .select({ q: searchLogs.normalizedQuery, n: sql<number>`count(*)::int` })
      .from(searchLogs)
      .where(gte(searchLogs.createdAt, since))
      .groupBy(searchLogs.normalizedQuery)
      .orderBy(desc(sql`count(*)`), asc(searchLogs.normalizedQuery))
      .limit(5),
    db
      .select({ q: searchLogs.normalizedQuery, n: sql<number>`count(*)::int` })
      .from(searchLogs)
      .where(and(gte(searchLogs.createdAt, since), eq(searchLogs.resultCount, 0)))
      .groupBy(searchLogs.normalizedQuery)
      .orderBy(desc(sql`count(*)`), asc(searchLogs.normalizedQuery))
      .limit(5),
    db
      .select({ mode: searchLogs.mode, n: sql<number>`count(*)::int` })
      .from(searchLogs)
      .where(and(gte(searchLogs.createdAt, since), inArray(searchLogs.mode, ["ai", "ai_fallback"])))
      .groupBy(searchLogs.mode),
  ]);
  const signupBy = new Map(signups.map((s) => [s.d, Number(s.n)]));
  const modeBy = new Map(modes.map((m) => [m.mode, Number(m.n)]));
  return {
    openCirculars: Number(agg.openCirculars),
    openVacancies: Number(agg.openVacancies),
    closingToday: Number(agg.closingToday),
    publishedToday: Number(agg.publishedToday),
    reviewPending: Number(agg.reviewPending),
    byCategory: byCat
      .map((r) => ({ labelBn: categories.find((c) => c.id === r.k)?.nameBn ?? r.k, count: Number(r.n) }))
      .sort((a, b) => b.count - a.count || a.labelBn.localeCompare(b.labelBn)),
    byDivision: byDiv
      .map((r) => ({ labelBn: r.k ? (divisions.find((d) => d.id === r.k)?.nameBn ?? r.k) : "সারা দেশ", count: Number(r.n) }))
      .sort((a, b) => b.count - a.count || a.labelBn.localeCompare(b.labelBn)),
    // Workflow runs arrive with the ingestion pipeline (Part 3).
    workflowRuns7d: days.map((date) => ({ date, succeeded: 0, failed: 0, waiting: 0 })),
    aiOutcomes: [
      { labelBn: "AI সফল", count: modeBy.get("ai") ?? 0 },
      { labelBn: "ফলব্যাক", count: modeBy.get("ai_fallback") ?? 0 },
    ],
    signupsPerDay: days.map((date) => ({ date, count: signupBy.get(date) ?? 0 })),
    topSearches: top.map((r) => ({ query: r.q, count: Number(r.n) })),
    zeroResultSearches: zero.map((r) => ({ query: r.q, count: Number(r.n) })),
  };
}
