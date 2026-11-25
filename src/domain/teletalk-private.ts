/**
 * Teletalk's public private-jobs list (`alljobs.teletalk.com.bd/api/v1/private-jobs/list`).
 * The list was empty when this was written (26 Nov 2026), so the item shape is not known yet: fields
 * are read defensively, using the names Teletalk's government-jobs API uses and common variants.
 * Pure: no I/O, so it is unit-tested with sample payloads.
 */

export const TELETALK_ORIGIN = "https://alljobs.teletalk.com.bd";
export const TELETALK_PRIVATE_LIST = `${TELETALK_ORIGIN}/api/v1/private-jobs/list?skipLimit=YES`;
export const TELETALK_PRIVATE_PAGE = `${TELETALK_ORIGIN}/jobs/private`;

export type TeletalkPrivateJob = {
  id: string;
  title: string;
  organization: string | null;
  deadline: string | null;
  /** Absolute URL of the advertisement PDF, when the item has one (used for PDF-URL ingest). */
  pdfUrl: string | null;
  pageUrl: string;
};

export type TeletalkPrivateList =
  | { available: true; count: number; jobs: TeletalkPrivateJob[]; checkedAt: string }
  | { available: false; checkedAt: string };

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

function first(o: Raw, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return null;
}

/** Nested objects such as `organization: { name }` or `org: { orgName }`. */
function nested(o: Raw, parents: string[], keys: string[]): string | null {
  for (const p of parents) {
    const child = o[p];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const v = first(child as Raw, keys);
      if (v) return v;
    }
  }
  return null;
}

/** The first string field that names a PDF, made absolute against Teletalk's media folder. */
function findPdf(o: Raw): string | null {
  const named = first(o, ["advertisement_file", "advertisementFile", "pdf", "pdfUrl", "pdf_url", "file", "attachment"]);
  const any = named && /\.pdf(\?|$)/i.test(named) ? named : Object.values(o).map(str).find((v) => v && /\.pdf(\?|$)/i.test(v)) ?? null;
  if (!any) return null;
  if (/^https?:\/\//i.test(any)) return any;
  return `${TELETALK_ORIGIN}/media/${any.replace(/^\/+/, "").replace(/^media\//, "")}`;
}

export function parseTeletalkPrivateJobs(payload: unknown, checkedAt: string): TeletalkPrivateList {
  if (!payload || typeof payload !== "object") return { available: false, checkedAt };
  const p = payload as Raw;
  const list = [p.privateJobs, p.jobs, p.data].find(Array.isArray) as Raw[] | undefined;
  if (p.status === "error" || !list) return { available: false, checkedAt };
  const jobs = list
    .filter((x): x is Raw => !!x && typeof x === "object")
    .map((x, i) => {
      const id = first(x, ["_id", "id", "jobId", "job_id"]) ?? String(i);
      return {
        id,
        title: first(x, ["jobTitle", "job_title", "title", "postName", "post_name", "jobName", "name"]) ?? "—",
        organization:
          first(x, ["orgName", "org_name", "organizationName", "organization_name", "companyName", "company_name", "employerName"]) ??
          nested(x, ["organization", "org", "company", "employer"], ["name", "orgName", "title", "name_en", "nameEn"]),
        deadline: first(x, ["applicationDeadline", "application_deadline", "deadline", "endDate", "end_date", "lastDate", "applicationEndDate"]),
        pdfUrl: findPdf(x),
        pageUrl: TELETALK_PRIVATE_PAGE,
      };
    });
  const count = typeof p.count === "number" ? p.count : jobs.length;
  return { available: true, count, jobs, checkedAt };
}
