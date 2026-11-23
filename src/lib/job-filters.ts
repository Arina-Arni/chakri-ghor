import type { JobFilters } from "@/types";

const ARRAY_KEYS = ["division", "district", "sector", "category", "organization", "education", "jobType", "workMode", "status"] as const;
export type ArrayFilterKey = (typeof ARRAY_KEYS)[number];

/** URL search params → filters. Lists are comma-separated so links stay short and shareable. */
export function parseFilters(sp: URLSearchParams): JobFilters {
  const f: JobFilters = {};
  const q = sp.get("q");
  if (q) f.q = q;
  for (const k of ARRAY_KEYS) {
    const v = sp.get(k);
    if (v) (f as Record<string, unknown>)[k] = v.split(",").filter(Boolean);
  }
  const min = Number(sp.get("salaryMin"));
  const max = Number(sp.get("salaryMax"));
  if (min > 0) f.salaryMin = min;
  if (max > 0) f.salaryMax = max;
  const dw = sp.get("deadlineWithin");
  if (dw === "today" || dw === "3d" || dw === "7d") f.deadlineWithin = dw;
  if (sp.get("eligibleOnly") === "1") f.eligibleOnly = true;
  const sort = sp.get("sort");
  if (sort === "deadline" || sort === "newest" || sort === "salary" || sort === "vacancies" || sort === "relevance") f.sort = sort;
  return f;
}

export function filtersToParams(f: JobFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  for (const k of ARRAY_KEYS) {
    const v = f[k] as string[] | undefined;
    if (v?.length) p.set(k, v.join(","));
  }
  if (f.salaryMin) p.set("salaryMin", String(f.salaryMin));
  if (f.salaryMax) p.set("salaryMax", String(f.salaryMax));
  if (f.deadlineWithin) p.set("deadlineWithin", f.deadlineWithin);
  if (f.eligibleOnly) p.set("eligibleOnly", "1");
  if (f.sort) p.set("sort", f.sort);
  return p;
}

/** Number of active filters (search text and sort excluded). */
export function activeFilterCount(f: JobFilters): number {
  let n = 0;
  for (const k of ARRAY_KEYS) n += (f[k] as string[] | undefined)?.length ?? 0;
  if (f.salaryMin) n++;
  if (f.salaryMax) n++;
  if (f.deadlineWithin) n++;
  if (f.eligibleOnly) n++;
  return n;
}

/** Remove one filter value (or a whole scalar filter when value is null). */
export function removeFilter(f: JobFilters, key: keyof JobFilters, value: string | null): JobFilters {
  const next = { ...f };
  const cur = next[key];
  if (Array.isArray(cur) && value != null) {
    const rest = (cur as string[]).filter((v) => v !== value);
    (next as Record<string, unknown>)[key] = rest.length ? rest : undefined;
  } else {
    delete next[key];
  }
  return next;
}

export function toggleArrayValue(f: JobFilters, key: ArrayFilterKey, value: string): JobFilters {
  const cur = (f[key] as string[] | undefined) ?? [];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  return { ...f, [key]: next.length ? next : undefined };
}

export const filtersKey = (f: JobFilters) => filtersToParams(f).toString();
