/**
 * Semantic checks on AI output (spec Part 3 §2.5, §2.8). Pure functions: the AI client calls
 * them after the shape check; anything invented is dropped or rejected.
 */
import { toEnDigits } from "@/domain/bn";
import { EDUCATION_LEVELS, type EducationLevel, type JobFilters, type Sector } from "@/types";

// ───────── resume hallucination guard ─────────

const DEGREE = /\b(b\.?\s?sc|m\.?\s?sc|bba|mba|bss|mss|b\.?\s?a|m\.?\s?a|phd|ph\.d|diploma|bachelor'?s?|master'?s?|hsc|ssc|llb|mbbs|b\.?\s?com|m\.?\s?com)\b/gi;
const CERT = /\b([A-Z][\w+#.-]*(?:\s+[A-Z][\w+#.-]*)*\s+(?:certified|certification|certificate)|certified\s+[A-Z][\w+#.-]*(?:\s+[A-Z][\w+#.-]*)*)\b/g;
const ORG_SUFFIX = /\b((?:[A-Z][\w&.'-]*\s+){0,5}(?:Ltd|Limited|Bank|University|College|School|Office|Ministry|Department|Directorate|Inc|Corporation|Company|Foundation|Board|Authority|Hospital|Institute|Bureau|Agency|Group|PLC|NGO))\b/g;
const TITLE = /\b((?:Senior|Junior|Assistant|Deputy|Chief|Head|Lead|Principal)?\s*(?:[A-Z][a-z]+\s+){0,2}(?:Officer|Manager|Engineer|Director|Executive|Developer|Teacher|Lecturer|Clerk|Operator|Accountant|Analyst|Consultant|Coordinator|Supervisor|Specialist|Administrator|Intern))\b/g;
const MONTH = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;
const NUMBER = /\d+(?:[.,]\d+)*%?/g;

const norm = (s: string) => toEnDigits(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Facts a sentence asserts that must come from the profile. */
export function factEntities(text: string): string[] {
  const t = toEnDigits(text);
  const out = new Set<string>();
  for (const re of [NUMBER, MONTH, DEGREE, CERT, ORG_SUFFIX, TITLE]) {
    for (const m of t.matchAll(new RegExp(re.source, re.flags))) {
      const v = norm(m[1] ?? m[0]);
      if (v.length >= 1) out.add(v);
    }
  }
  return [...out];
}

/**
 * Reject a rewrite that introduces an employer, job title, date, degree, institution, number or
 * certification that is not already in the profile/resume (`corpus`) or the original text.
 */
export function guardResumeChange(change: { before: string; after: string }, corpus: string): { ok: boolean; introduced: string[] } {
  const known = norm(`${corpus}\n${change.before}`);
  const introduced = factEntities(change.after).filter((e) => !known.includes(e));
  return { ok: introduced.length === 0, introduced };
}

// ───────── AI search filters ─────────

export type AiSearchOutput = {
  keywords: string[];
  district_ids: string[];
  division_ids: string[];
  sector: string | null;
  category_slugs: string[];
  job_type: string | null;
  work_mode: string | null;
  salary_min: number | null;
  education_level: string | null;
  deadline_within_days: number | null;
  confidence: number;
};

export type SearchVocabulary = {
  districtIds: Set<string>;
  divisionIds: Set<string>;
  categoryBySlug: Map<string, string>;
};

const SECTORS: Sector[] = ["government", "semi_government", "autonomous", "private", "ngo", "international"];
const JOB_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
const WORK_MODES = ["onsite", "remote", "hybrid"] as const;

/** Turn the model's answer into JobFilters, dropping anything outside the vocabulary. */
export function filtersFromAi(o: AiSearchOutput, v: SearchVocabulary): { filters: JobFilters; issues: string[]; confidence: number } {
  const issues: string[] = [];
  const filters: JobFilters = {};
  const keep = <T>(list: T[], ok: (x: T) => boolean, label: string) =>
    list.filter((x) => {
      if (ok(x)) return true;
      issues.push(`${label}:${String(x)}`);
      return false;
    });
  const districts = keep(o.district_ids, (d) => v.districtIds.has(d), "district");
  if (districts.length) filters.district = [...new Set(districts)];
  const divisions = keep(o.division_ids, (d) => v.divisionIds.has(d), "division");
  if (divisions.length) filters.division = [...new Set(divisions)];
  const cats = keep(o.category_slugs, (s) => v.categoryBySlug.has(s), "category").map((s) => v.categoryBySlug.get(s)!);
  if (cats.length) filters.category = [...new Set(cats)];
  if (o.sector) {
    if (SECTORS.includes(o.sector as Sector)) filters.sector = [o.sector as Sector];
    else issues.push(`sector:${o.sector}`);
  }
  if (o.job_type) {
    if ((JOB_TYPES as readonly string[]).includes(o.job_type)) filters.jobType = [o.job_type as (typeof JOB_TYPES)[number]];
    else issues.push(`job_type:${o.job_type}`);
  }
  if (o.work_mode) {
    if ((WORK_MODES as readonly string[]).includes(o.work_mode)) filters.workMode = [o.work_mode as (typeof WORK_MODES)[number]];
    else issues.push(`work_mode:${o.work_mode}`);
  }
  if (o.education_level) {
    if ((EDUCATION_LEVELS as readonly string[]).includes(o.education_level)) filters.education = [o.education_level as EducationLevel];
    else issues.push(`education:${o.education_level}`);
  }
  if (o.salary_min != null) {
    if (Number.isInteger(o.salary_min) && o.salary_min > 0 && o.salary_min <= 1_000_000) filters.salaryMin = o.salary_min;
    else issues.push(`salary_min:${o.salary_min}`);
  }
  if (o.deadline_within_days != null) {
    const d = o.deadline_within_days;
    if (d >= 0 && d <= 60) filters.deadlineWithin = d <= 1 ? "today" : d <= 3 ? "3d" : "7d";
    else issues.push(`deadline:${d}`);
  }
  const words = o.keywords.map((k) => k.trim()).filter((k) => k.length > 1 && k.length <= 40).slice(0, 6);
  if (words.length) filters.q = words.join(" ");
  const confidence = Math.min(1, Math.max(0, Number.isFinite(o.confidence) ? o.confidence : 0));
  return { filters, issues, confidence: issues.length ? Math.min(confidence, 0.6) : confidence };
}
