// TEMP — replaced by the real implementation in Part 2
import { dhakaDateKey, formatNumberBn } from "@/domain/bn";
import { displayStatus } from "@/domain/status";
import { t } from "@/i18n";
import type {
  Circular,
  CircularDetail,
  CircularListItem,
  FacetKey,
  FacetOption,
  Facets,
  JobFilters,
  LandingStats,
  OrganizationDetail,
  Page,
  ParsedSearch,
  Result,
  SearchChip,
  Taxonomy,
  ZeroResultSuggestion,
} from "@/types";
import { EDUCATION_LEVELS } from "@/types";
import { ai, fail, mutate, ok, read } from "./_runtime";
import { getRole } from "./session";
import { getDb } from "./fixtures/db";
import { computeEligibility } from "./fixtures/eligibility";
import { categories, categoryById, districtById, districts, divisionById, divisions, tags } from "./fixtures/taxonomy";

const PAGE_SIZE = 10;
const DAY = 86_400_000;

// ───────── helpers ─────────

function isPublic(c: Circular) {
  return c.status === "published";
}

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
    primaryPostId: c.posts[0].id,
    postCount: c.posts.length,
    salaryMin: salaries.length ? Math.min(...salaries) : null,
    salaryMax: salaries.length ? Math.max(...salaries) : null,
    districtNameBn: c.districtId ? (districtById.get(c.districtId)?.nameBn ?? null) : null,
    bookmarked: c.posts.some((p) => bookmarkedPostIds.has(p.id)),
  };
}

function bookmarkedSet(): Set<string> {
  if (getRole() === "guest") return new Set();
  return new Set(getDb().bookmarks.map((b) => b.postId));
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function searchText(c: Circular): string {
  const d = c.districtId ? districtById.get(c.districtId) : null;
  return norm(
    [
      c.titleBn,
      c.titleEn,
      c.organization.nameBn,
      c.organization.nameEn,
      c.organization.shortName,
      ...c.posts.flatMap((p) => [p.titleBn, p.titleEn]),
      d?.nameBn ?? "",
      d?.nameEn ?? "",
      ...c.aiTags,
      categoryById.get(c.categoryId)?.nameBn ?? "",
    ].join(" "),
  );
}

function maxSalary(c: Circular): number | null {
  const v = c.posts.flatMap((p) => [p.salaryMax, p.salaryMin]).filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
}

function matches(c: Circular, f: JobFilters, now: number, skip?: FacetKey): boolean {
  const st = displayStatus(c, now);
  const statusFilter = skip === "status" ? undefined : f.status;
  if (statusFilter?.length) {
    const want = new Set(statusFilter);
    const isOpen = st === "open" || st === "closing_soon";
    if (!((want.has("open") && isOpen) || (want.has("upcoming") && st === "upcoming"))) return false;
  } else if (st === "closed") return false;

  if (f.q?.trim()) {
    const hay = searchText(c);
    const tokens = norm(f.q).split(" ").filter(Boolean);
    if (!tokens.every((tk) => hay.includes(tk))) return false;
  }
  if (skip !== "division" && f.division?.length && !(c.divisionId && f.division.includes(c.divisionId))) return false;
  if (skip !== "district" && f.district?.length && !(c.districtId && f.district.includes(c.districtId))) return false;
  if (skip !== "sector" && f.sector?.length && !f.sector.includes(c.sector)) return false;
  if (skip !== "category" && f.category?.length && !f.category.includes(c.categoryId)) return false;
  if (skip !== "organization" && f.organization?.length && !f.organization.includes(c.organization.id)) return false;
  if (skip !== "education" && f.education?.length && !c.posts.some((p) => f.education!.includes(p.minEducation))) return false;
  if (skip !== "jobType" && f.jobType?.length && !f.jobType.includes(c.jobType)) return false;
  if (skip !== "workMode" && f.workMode?.length && !f.workMode.includes(c.workMode)) return false;
  if (f.salaryMin != null || f.salaryMax != null) {
    const s = maxSalary(c);
    if (s == null) return false;
    if (f.salaryMin != null && s < f.salaryMin) return false;
    const low = Math.min(...c.posts.map((p) => p.salaryMin ?? Infinity));
    if (f.salaryMax != null && low > f.salaryMax) return false;
  }
  if (skip !== "deadlineWithin" && f.deadlineWithin) {
    const end = new Date(c.endAt).getTime();
    if (end <= now) return false;
    if (f.deadlineWithin === "today" && dhakaDateKey(end) !== dhakaDateKey(now)) return false;
    if (f.deadlineWithin === "3d" && end - now > 3 * DAY) return false;
    if (f.deadlineWithin === "7d" && end - now > 7 * DAY) return false;
  }
  if (f.eligibleOnly && getRole() !== "guest") {
    const db = getDb();
    if (!c.posts.some((p) => computeEligibility(c, p, db.profile, now).verdict !== "not_eligible")) return false;
  }
  return true;
}

function relevance(c: Circular, q: string | undefined): number {
  if (!q) return 0;
  const hay = searchText(c);
  return norm(q)
    .split(" ")
    .filter((tk) => hay.includes(tk)).length + (norm(c.titleBn).includes(norm(q)) ? 5 : 0);
}

function sortCirculars(list: Circular[], f: JobFilters, now: number): Circular[] {
  const sort = f.sort ?? (f.q ? "relevance" : "deadline");
  const byDeadline = (a: Circular, b: Circular) => {
    const ea = new Date(a.endAt).getTime();
    const eb = new Date(b.endAt).getTime();
    const ca = ea <= now ? 1 : 0;
    const cb = eb <= now ? 1 : 0;
    return ca - cb || ea - eb;
  };
  const copy = [...list];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    case "salary":
      return copy.sort((a, b) => (maxSalary(b) ?? -1) - (maxSalary(a) ?? -1));
    case "vacancies":
      return copy.sort((a, b) => b.totalVacancies - a.totalVacancies);
    case "relevance":
      return copy.sort((a, b) => relevance(b, f.q) - relevance(a, f.q) || byDeadline(a, b));
    default:
      return copy.sort(byDeadline);
  }
}

function filtered(f: JobFilters, now: number, skip?: FacetKey): Circular[] {
  return getDb().circulars.filter((c) => isPublic(c) && matches(c, f, now, skip));
}

// ───────── public API ─────────

export async function getTaxonomy(): Promise<Result<Taxonomy>> {
  return read(() => ({
    divisions,
    districts,
    categories,
    tags,
    organizations: getDb().organizations.map((o) => ({
      id: o.id,
      slug: o.slug,
      nameBn: o.nameBn,
      nameEn: o.nameEn,
      shortName: o.shortName,
      verified: o.verified,
      type: o.type,
    })),
  }), { ignoreForced: true });
}

export async function listCirculars(filters: JobFilters, cursor: string | null = null): Promise<Result<Page<CircularListItem>>> {
  return read(
    () => {
      const now = Date.now();
      const all = sortCirculars(filtered(filters, now), filters, now);
      const offset = cursor ? Number(cursor) : 0;
      const slice = all.slice(offset, offset + PAGE_SIZE);
      const bm = bookmarkedSet();
      return {
        items: slice.map((c) => toListItem(c, bm)),
        nextCursor: offset + PAGE_SIZE < all.length ? String(offset + PAGE_SIZE) : null,
        total: all.length,
      };
    },
    { empty: () => ({ items: [], nextCursor: null, total: 0 }) },
  );
}

const SECTORS = ["government", "semi_government", "autonomous", "private", "ngo", "international"] as const;
const JOB_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
const WORK_MODES = ["onsite", "remote", "hybrid"] as const;

export async function getFacets(filters: JobFilters): Promise<Result<Facets>> {
  return read(() => {
    const now = Date.now();
    const count = (key: FacetKey, pred: (c: Circular) => boolean) => filtered(filters, now, key).filter(pred).length;
    const keep = (opts: FacetOption[], selected: string[] | undefined) =>
      opts.filter((o) => o.count > 0 || selected?.includes(o.value));
    const db = getDb();
    const facets: Facets = {
      total: filtered(filters, now).length,
      division: divisions.map((d) => ({ value: d.id, labelBn: d.nameBn, count: count("division", (c) => c.divisionId === d.id) })),
      district: keep(
        districts.map((d) => ({ value: d.id, labelBn: d.nameBn, count: count("district", (c) => c.districtId === d.id) })),
        filters.district,
      ).sort((a, b) => b.count - a.count),
      sector: keep(
        SECTORS.map((s) => ({ value: s, labelBn: t(`enums.sector.${s}`), count: count("sector", (c) => c.sector === s) })),
        filters.sector,
      ),
      category: categories.map((c) => ({ value: c.id, labelBn: c.nameBn, count: count("category", (x) => x.categoryId === c.id) })),
      organization: keep(
        db.organizations.map((o) => ({ value: o.id, labelBn: o.nameBn, count: count("organization", (c) => c.organization.id === o.id) })),
        filters.organization,
      ).sort((a, b) => b.count - a.count),
      education: EDUCATION_LEVELS.map((e) => ({
        value: e,
        labelBn: t(`enums.education.${e}`),
        count: count("education", (c) => c.posts.some((p) => p.minEducation === e)),
      })),
      jobType: JOB_TYPES.map((j) => ({ value: j, labelBn: t(`enums.jobType.${j}`), count: count("jobType", (c) => c.jobType === j) })),
      workMode: WORK_MODES.map((w) => ({ value: w, labelBn: t(`enums.workMode.${w}`), count: count("workMode", (c) => c.workMode === w) })),
      deadlineWithin: (["today", "3d", "7d"] as const).map((d) => ({
        value: d,
        labelBn: t(`enums.deadlineWithin.${d}`),
        count: filtered({ ...filters, deadlineWithin: d }, now, undefined).length,
      })),
      status: (["open", "upcoming"] as const).map((s) => ({
        value: s,
        labelBn: t(s === "open" ? "common.open" : "common.upcoming"),
        count: filtered({ ...filters, status: [s] }, now).length,
      })),
    };
    return facets;
  });
}

/** Human label of one filter value, used by chips and suggestions. */
export function filterValueLabel(key: keyof JobFilters, value: string): string {
  switch (key) {
    case "division":
      return divisionById.get(value)?.nameBn ?? value;
    case "district":
      return districtById.get(value)?.nameBn ?? value;
    case "category":
      return categoryById.get(value)?.nameBn ?? value;
    case "organization":
      return getDb().organizations.find((o) => o.id === value)?.nameBn ?? value;
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
      return `৳${formatNumberBn(Number(value))}+`;
    case "salaryMax":
      return `≤ ৳${formatNumberBn(Number(value))}`;
    case "eligibleOnly":
      return t("jobs.eligibleOnly");
    case "q":
      return `“${value}”`;
    default:
      return value;
  }
}

/** Removing one active filter at a time — how many results would that give? */
export async function getZeroResultSuggestions(filters: JobFilters): Promise<Result<ZeroResultSuggestion[]>> {
  return read(() => {
    const now = Date.now();
    const out: ZeroResultSuggestion[] = [];
    const arrayKeys = ["division", "district", "sector", "category", "organization", "education", "jobType", "workMode", "status"] as const;
    for (const key of arrayKeys) {
      for (const value of filters[key] ?? []) {
        const next = { ...filters, [key]: (filters[key] as string[]).filter((v) => v !== value) };
        out.push({ key, value, labelBn: filterValueLabel(key, value), resultCount: filtered(next, now).length });
      }
    }
    const scalar = ["q", "salaryMin", "salaryMax", "deadlineWithin", "eligibleOnly"] as const;
    for (const key of scalar) {
      if (filters[key] == null || filters[key] === "" || filters[key] === false) continue;
      const next = { ...filters, [key]: undefined };
      out.push({ key, value: null, labelBn: filterValueLabel(key, String(filters[key])), resultCount: filtered(next, now).length });
    }
    return out.filter((s) => s.resultCount > 0).sort((a, b) => b.resultCount - a.resultCount);
  }, { empty: () => [] });
}

export async function getCircular(slug: string): Promise<Result<CircularDetail>> {
  return read(() => {
    const db = getDb();
    const c = db.circulars.find((x) => x.slug === slug);
    if (!c || (!isPublic(c) && getRole() !== "admin" && getRole() !== "moderator")) return fail("NOT_FOUND");
    const now = Date.now();
    const bm = bookmarkedSet();
    const similar = db.circulars
      .filter((x) => x.id !== c.id && isPublic(x) && x.categoryId === c.categoryId && new Date(x.endAt).getTime() > now)
      .slice(0, 3);
    const fill = similar.length < 3
      ? db.circulars.filter((x) => x.id !== c.id && isPublic(x) && !similar.includes(x) && new Date(x.endAt).getTime() > now).slice(0, 3 - similar.length)
      : [];
    const signedIn = getRole() !== "guest";
    return ok({
      circular: c,
      similar: [...similar, ...fill].map((x) => toListItem(x, bm)),
      bookmarkedPostIds: c.posts.filter((p) => bm.has(p.id)).map((p) => p.id),
      trackedPosts: signedIn
        ? Object.fromEntries(db.applications.filter((a) => a.circularId === c.id).map((a) => [a.postId, a.id]))
        : {},
    });
  });
}

export async function getOrganization(slug: string): Promise<Result<OrganizationDetail>> {
  return read(
    () => {
      const db = getDb();
      const o = db.organizations.find((x) => x.slug === slug);
      if (!o) return fail("NOT_FOUND");
      const now = Date.now();
      const bm = bookmarkedSet();
      const mine = db.circulars.filter((c) => c.organization.id === o.id && isPublic(c));
      return ok({
        organization: o,
        open: mine.filter((c) => new Date(c.endAt).getTime() > now).map((c) => toListItem(c, bm)),
        past: mine.filter((c) => new Date(c.endAt).getTime() <= now).map((c) => toListItem(c, bm)),
      });
    },
  );
}

export async function getLandingStats(): Promise<Result<LandingStats>> {
  return read(() => {
    const db = getDb();
    const now = Date.now();
    const open = db.circulars.filter((c) => isPublic(c) && new Date(c.endAt).getTime() > now);
    const today = open.filter((c) => dhakaDateKey(c.endAt) === dhakaDateKey(now) || new Date(c.endAt).getTime() - now < 12 * 3_600_000);
    const bm = bookmarkedSet();
    return {
      openCirculars: open.length,
      totalVacancies: open.reduce((n, c) => n + c.totalVacancies, 0),
      closingToday: today.length,
      closingTodayJobs: today
        .sort((a, b) => a.endAt.localeCompare(b.endAt))
        .map((c) => toListItem(c, bm)),
      categories: categories.map((c) => ({ id: c.id, slug: c.slug, nameBn: c.nameBn, icon: c.icon, count: open.filter((x) => x.categoryId === c.id).length })),
      divisions: divisions.map((d) => ({ id: d.id, slug: d.slug, nameBn: d.nameBn, count: open.filter((x) => x.divisionId === d.id).length })),
    };
  });
}

// ───────── AI search (rule-based stand-in for Gemini) ─────────

const STOPWORDS = new Set(["চাকরি", "চাকরির", "জব", "job", "jobs", "পাসে", "পাস", "বেতনের", "বেতন", "এর", "ও", "এবং", "জন্য", "in", "the", "a", "with"]);
const SUFFIXES = ["গুলোর", "দের", "েরে", "ের", "র", "য়", "তে", "কে", "এ"];

function stem(token: string): string {
  for (const s of SUFFIXES) if (token.length > s.length + 2 && token.endsWith(s)) return token.slice(0, -s.length);
  return token;
}

const CATEGORY_WORDS: [RegExp, string][] = [
  [/ব্যাংক|bank|ফিন্যান্স|finance/i, "cat_bank"],
  [/ডিজাইন|design|গ্রাফিক/i, "cat_design"],
  [/শিক্ষক|teacher|শিক্ষা/i, "cat_edu"],
  [/নার্স|ডাক্তার|স্বাস্থ্য|health|nurse|হাসপাতাল/i, "cat_health"],
  [/ইঞ্জিনিয়ার|প্রকৌশল|engineer/i, "cat_eng"],
  [/ডেভেলপার|developer|সফটওয়্যার|software|প্রোগ্রামার|it\b/i, "cat_it"],
  [/পুলিশ|police|আর্মি|army/i, "cat_defense"],
  [/এনজিও|ngo/i, "cat_ngo"],
  [/ড্রাইভার|চালক|driver/i, "cat_tech"],
];

const EDU_WORDS: [RegExp, (typeof EDUCATION_LEVELS)[number]][] = [
  [/এসএসসি|ssc|মাধ্যমিক/i, "ssc"],
  [/এইচএসসি|hsc|উচ্চ মাধ্যমিক/i, "hsc"],
  [/ডিপ্লোমা|diploma/i, "diploma"],
  [/স্নাতকোত্তর|মাস্টার্স|masters/i, "masters"],
  [/স্নাতক|অনার্স|graduate|bachelor|honours/i, "bachelor"],
];

function parseRules(text: string): Omit<ParsedSearch, "mode"> {
  const filters: JobFilters = {};
  const chips: SearchChip[] = [];
  let rest = ` ${text.toLowerCase()} `;
  let hits = 0;

  for (const d of districts) {
    const names = [d.nameBn, d.nameEn.toLowerCase(), ...d.aliases];
    const name = names.find((n) => rest.includes(n.toLowerCase()));
    if (name) {
      filters.district = [...(filters.district ?? []), d.id];
      chips.push({ key: "district", value: d.id, labelBn: d.nameBn });
      rest = rest.replace(new RegExp(`${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S*`, "g"), " ");
      hits++;
    }
  }
  if (/বেসরকারি|private/i.test(rest)) {
    filters.sector = ["private"];
    chips.push({ key: "sector", value: "private", labelBn: t("enums.sector.private") });
    rest = rest.replace(/বেসরকারি|private/gi, " ");
    hits++;
  } else if (/সরকারি|government|govt/i.test(rest)) {
    filters.sector = ["government"];
    chips.push({ key: "sector", value: "government", labelBn: t("enums.sector.government") });
    rest = rest.replace(/সরকারি|government|govt/gi, " ");
    hits++;
  }
  for (const [re, id] of CATEGORY_WORDS) {
    if (re.test(rest)) {
      filters.category = [id];
      chips.push({ key: "category", value: id, labelBn: categoryById.get(id)!.nameBn });
      rest = rest.replace(new RegExp(re.source + "\\S*", "gi"), " ");
      hits++;
      break;
    }
  }
  for (const [re, level] of EDU_WORDS) {
    if (re.test(rest)) {
      filters.education = [level];
      chips.push({ key: "education", value: level, labelBn: t(`enums.education.${level}`) });
      rest = rest.replace(new RegExp(re.source, "gi"), " ");
      hits++;
      break;
    }
  }
  const salary = /([০-৯\d]+)\s*(হাজার|k)\s*\+?/i.exec(rest);
  if (salary) {
    const n = Number(salary[1].replace(/[০-৯]/g, (x) => String(x.charCodeAt(0) - 0x09e6))) * 1000;
    filters.salaryMin = n;
    chips.push({ key: "salaryMin", value: String(n), labelBn: `৳${formatNumberBn(n)}+` });
    rest = rest.replace(salary[0], " ");
    hits++;
  }
  if (/রিমোট|remote|বাসা থেকে/i.test(rest)) {
    filters.workMode = ["remote"];
    chips.push({ key: "workMode", value: "remote", labelBn: t("enums.workMode.remote") });
    rest = rest.replace(/রিমোট|remote|বাসা থেকে/gi, " ");
    hits++;
  }
  const leftover = rest
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{M}\p{N}+#.-]/gu, ""))
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length > 1);
  if (leftover.length) {
    filters.q = leftover.join(" ");
    chips.push({ key: "q", value: filters.q, labelBn: filters.q });
  }
  const confidence = hits === 0 ? 0.35 : Math.min(0.97, 0.55 + hits * 0.15 - leftover.length * 0.05);
  return { filters, chips, confidence: Math.max(0.3, confidence) };
}

const GUEST_AI_LIMIT = 3;

/** AI query understanding. Quota: guests 3/day, signed-in users per plan. */
export async function parseSearchQuery(text: string): Promise<Result<ParsedSearch>> {
  const db = getDb();
  const role = getRole();
  const usage = db.billing.usage.find((u) => u.feature === "ai_search")!;
  const quotaError = (): Result<ParsedSearch> =>
    role === "guest"
      ? fail("QUOTA_EXCEEDED", { message_bn: t("search.quotaGuest"), retryAfterSec: 6 * 3600, fields: { audience: "guest" } })
      : fail("QUOTA_EXCEEDED", {
          retryAfterSec: Math.max(60, Math.round((new Date(usage.resetsAt).getTime() - Date.now()) / 1000)),
          fields: { audience: "user", used: String(usage.limit), limit: String(usage.limit), resetsAt: usage.resetsAt },
        });
  return ai<ParsedSearch>(
    (mode) => {
      if (role === "guest") {
        if (db.aiSearchUsedGuest >= GUEST_AI_LIMIT) return quotaError();
        db.aiSearchUsedGuest++;
      } else {
        if (usage.used >= usage.limit) return quotaError();
        usage.used++;
      }
      const parsed = parseRules(text);
      if (mode === "fallback") {
        // Keyword search: the whole text becomes the query, no AI chips.
        const q = text.trim();
        return { filters: { q }, chips: [{ key: "q", value: q, labelBn: q }], confidence: 1, mode };
      }
      return { ...parsed, mode };
    },
    { quota: quotaError },
  );
}

export async function reportCircularError(circularId: string, message: string, idempotencyKey: string): Promise<Result<{ received: true }>> {
  return mutate(idempotencyKey, () => {
    getDb().reports.push({ circularId, message });
    return { received: true as const };
  });
}
