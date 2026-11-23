import { formatNumberBn } from "@/domain/bn";
import { categoryById, districtById, divisionById } from "@/domain/taxonomy";
import { t } from "@/i18n";
import type {
  CircularDetail,
  CircularListItem,
  Facets,
  JobFilters,
  LandingStats,
  OrganizationDetail,
  Page,
  ParsedSearch,
  Result,
  Taxonomy,
  ZeroResultSuggestion,
} from "@/types";
import { recordApplyClickAction, reportCircularErrorAction } from "@/server/actions/seeker";
import { forcedState, fail, mutate, query } from "./_runtime";

/** Organization names seen so far (taxonomy and facets), for synchronous chip labels. */
const orgNames = new Map<string, string>();

export async function getTaxonomy(): Promise<Result<Taxonomy>> {
  const r = await query<Taxonomy>("getTaxonomy", [], { ignoreForced: true, signedIn: false });
  if (r.ok) for (const o of r.data.organizations) orgNames.set(o.id, o.nameBn);
  return r;
}

export async function listCirculars(filters: JobFilters, cursor: string | null = null): Promise<Result<Page<CircularListItem>>> {
  return query("listCirculars", [filters, cursor], { empty: () => ({ items: [], nextCursor: null, total: 0 }), signedIn: false });
}

export async function getFacets(filters: JobFilters): Promise<Result<Facets>> {
  const r = await query<Facets>("getFacets", [filters], { signedIn: false });
  if (r.ok) for (const o of r.data.organization) orgNames.set(o.value, o.labelBn);
  return r;
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
      return orgNames.get(value) ?? value;
    case "sector":
      return t(`enums.sector.${value as "government"}`);
    case "education":
      return t(`enums.education.${value as "ssc"}`);
    case "jobType":
      return t(`enums.jobType.${value as "full_time"}`);
    case "workMode":
      return t(`enums.workMode.${value as "onsite"}`);
    case "deadlineWithin":
      return t(`enums.deadlineWithin.${value as "today"}`);
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

export async function getZeroResultSuggestions(filters: JobFilters): Promise<Result<ZeroResultSuggestion[]>> {
  return query("getZeroResultSuggestions", [filters], { empty: () => [], signedIn: false });
}

export async function getCircular(slug: string): Promise<Result<CircularDetail>> {
  return query("getCircular", [slug], { signedIn: false });
}

export async function getOrganization(slug: string): Promise<Result<OrganizationDetail>> {
  return query("getOrganization", [slug], { signedIn: false });
}

export async function getLandingStats(): Promise<Result<LandingStats>> {
  return query("getLandingStats", [], { signedIn: false });
}

/**
 * Query understanding. Part 2: the rule-based parser only (`mode: "fallback"`);
 * Part 3 puts Gemini in front of it with quotas and fault tolerance.
 */
export async function parseSearchQuery(text: string): Promise<Result<ParsedSearch>> {
  const state = forcedState();
  if (state === "quota") return fail("QUOTA_EXCEEDED", { message_bn: t("search.quotaGuest"), retryAfterSec: 6 * 3600, fields: { audience: "guest" } });
  return query("parseSearchQuery", [text], { signedIn: false });
}

export async function reportCircularError(circularId: string, message: string, idempotencyKey: string): Promise<Result<{ received: true }>> {
  return mutate(() => reportCircularErrorAction(circularId, message, idempotencyKey));
}

/** Count an apply-button click (once per user or session per day). Fire and forget. */
export async function recordApplyClick(circularId: string): Promise<Result<{ counted: boolean }>> {
  return mutate(() => recordApplyClickAction(circularId));
}
