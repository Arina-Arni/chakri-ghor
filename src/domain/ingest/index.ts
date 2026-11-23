/**
 * Circular-ingestion normalization (spec Part 3 §3.2 steps 3–4). Pure: turns an extraction
 * (from Gemini, an admin's edit, or the heuristic fallback) into validated circular fields with
 * per-field flags. Critical problems stop the run for an admin to fix.
 */
import { z } from "zod";
import { dhakaToUtc, toEnDigits } from "@/domain/bn";
import type { District } from "@/types";
import { EDUCATION_LEVELS, type EducationLevel } from "@/types";

const n = <T extends z.ZodType>(s: T) => s.nullable().optional();

export const extractionSchema = z.object({
  organization_bn: n(z.string()),
  organization_en: n(z.string()),
  notice_no: n(z.string()),
  title_bn: n(z.string()),
  title_en: n(z.string()),
  published_on: n(z.string()),
  application_start_at: n(z.string()),
  application_end_at: n(z.string()),
  age_reference_date: n(z.string()),
  apply_url: n(z.string()),
  apply_platform: n(z.string()),
  fee_text: n(z.string()),
  posts: z
    .array(
      z.object({
        title_bn: n(z.string()),
        title_en: n(z.string()),
        vacancies: n(z.union([z.number(), z.string()])),
        grade: n(z.string()),
        salary_min: n(z.union([z.number(), z.string()])),
        salary_max: n(z.union([z.number(), z.string()])),
        salary_text: n(z.string()),
        min_education: n(z.string()),
        subjects: n(z.array(z.string())),
        experience_years: n(z.union([z.number(), z.string()])),
        age_min: n(z.union([z.number(), z.string()])),
        age_max: n(z.union([z.number(), z.string()])),
        relaxations: n(z.array(z.object({ category: z.string(), extra_years: z.union([z.number(), z.string()]) }))),
        eligible_districts: n(z.array(z.string())),
        gender: n(z.string()),
        other_requirements: n(z.array(z.string())),
        keywords_en: n(z.array(z.string())),
      }),
    )
    .max(50),
  field_confidence: n(z.record(z.string(), z.number())),
  overall_confidence: n(z.number()),
});
export type Extraction = z.infer<typeof extractionSchema>;

export type NormalizedPost = {
  titleBn: string;
  titleEn: string;
  vacancies: number;
  grade: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string | null;
  minEducation: EducationLevel;
  subjects: string[];
  experienceYears: number;
  ageMin: number | null;
  ageMax: number | null;
  ageRelaxations: { categoryBn: string; extraYears: number }[];
  eligibleDistrictIds: string[];
  gender: "any" | "male" | "female";
  otherRequirements: string[];
  keywordsEn: string[];
};

export type Normalized = {
  organizationBn: string;
  organizationEn: string;
  noticeNo: string | null;
  titleBn: string;
  titleEn: string;
  publishedOn: string | null;
  startAt: string | null;
  endAt: string | null;
  ageReferenceDate: string | null;
  applyUrl: string | null;
  applyPlatform: "teletalk" | "official_site" | "email" | "postal";
  feeText: string | null;
  applicationFee: number | null;
  posts: NormalizedPost[];
  confidence: number;
};

export type Flag = { field: string; message: string; critical: boolean };

const BN_MONTHS: Record<string, number> = {
  জানুয়ারি: 1, জানুয়ারী: 1, ফেব্রুয়ারি: 2, ফেব্রুয়ারী: 2, মার্চ: 3, এপ্রিল: 4, মে: 5, জুন: 6, জুলাই: 7, আগস্ট: 8, আগষ্ট: 8,
  সেপ্টেম্বর: 9, অক্টোবর: 10, নভেম্বর: 11, ডিসেম্বর: 12,
};
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (x: number) => String(x).padStart(2, "0");
function validYmd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** "২০২৬-১২-১৫", "15/12/2026", "১৫ ডিসেম্বর ২০২৬", "15 Dec 2026" → "2026-12-15". */
export function parseDateLoose(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = toEnDigits(input).trim().toLowerCase().replace(/[,ইং।]/g, " ").replace(/\s+/g, " ");
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return validYmd(+m[3], +m[2], +m[1]);
  m = /(\d{1,2})\s+([^\s\d]+)\s+(\d{4})/.exec(s);
  if (m) {
    const word = m[2];
    const month = BN_MONTHS[word] ?? (EN_MONTHS.findIndex((x) => word.startsWith(x)) + 1 || 0);
    if (month) return validYmd(+m[3], month, +m[1]);
  }
  return null;
}

/** Time of day in a Bangla/English string ("বিকাল ৫টা", "5:00 PM"); null if none. */
export function parseTimeLoose(input: string): string | null {
  const s = toEnDigits(input).toLowerCase();
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|টা)?/.exec(s.replace(/.*?(?=\d{1,2}(:\d{2})?\s*(am|pm|টা))/, ""));
  if (!m || !m[3]) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" || /বিকাল|বিকেল|সন্ধ্যা|রাত/.test(s)) h = h < 12 ? h + 12 : h;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** A Dhaka-time datetime from text; date-only uses `defaultTime`. ISO UTC out. */
export function parseDateTimeLoose(input: string | null | undefined, defaultTime: string): string | null {
  if (!input) return null;
  const iso = /^\d{4}-\d{2}-\d{2}T/.test(input) ? new Date(input) : null;
  if (iso && !Number.isNaN(iso.getTime())) return iso.toISOString();
  const d = parseDateLoose(input);
  if (!d) return null;
  return dhakaToUtc(d, parseTimeLoose(input) ?? defaultTime).toISOString();
}

function int(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const x = typeof v === "number" ? v : Number(toEnDigits(String(v)).replace(/[,\s৳]/g, ""));
  return Number.isFinite(x) ? Math.round(x) : null;
}

const EDU: [RegExp, EducationLevel][] = [
  [/phd|পিএইচডি/i, "phd"],
  [/master|স্নাতকোত্তর|মাস্টার্স/i, "masters"],
  [/bachelor|graduat|স্নাতক|ডিগ্রি|অনার্স/i, "bachelor"],
  [/diploma|ডিপ্লোমা/i, "diploma"],
  [/hsc|এইচএসসি|উচ্চ মাধ্যমিক/i, "hsc"],
  [/ssc|এসএসসি|মাধ্যমিক/i, "ssc"],
  [/class\s*8|অষ্টম|jsc|জেএসসি/i, "class_8"],
];

function education(v: string | null | undefined): EducationLevel | null {
  if (!v) return null;
  if ((EDUCATION_LEVELS as readonly string[]).includes(v)) return v as EducationLevel;
  return EDU.find(([re]) => re.test(v))?.[1] ?? null;
}

/** District name/alias (Bangla, English, Banglish) → id. */
export function districtIdFor(name: string, districts: District[]): string | null {
  const k = name.trim().toLowerCase().replace(/\s*জেলা$/, "");
  const d = districts.find((x) => x.id === k || x.nameBn === k || x.nameEn.toLowerCase() === k || x.aliases.some((a) => a.toLowerCase() === k));
  return d?.id ?? null;
}

function platform(v: string | null | undefined, url: string | null): Normalized["applyPlatform"] {
  const s = `${v ?? ""} ${url ?? ""}`.toLowerCase();
  if (/teletalk/.test(s)) return "teletalk";
  if (/mail|ইমেইল/.test(s)) return "email";
  if (/post|ডাক/.test(s)) return "postal";
  return "official_site";
}

/** Validate and normalize an extraction. Flags with `critical: true` block the run. */
export function normalizeExtraction(x: Extraction, districts: District[], now: number): { value: Normalized; flags: Flag[] } {
  const flags: Flag[] = [];
  const flag = (field: string, message: string, critical = false) => flags.push({ field, message, critical });

  const titleBn = (x.title_bn ?? x.title_en ?? "").trim();
  if (titleBn.length < 3) flag("title_bn", "শিরোনাম পাওয়া যায়নি", true);
  const organizationBn = (x.organization_bn ?? x.organization_en ?? "").trim();
  if (organizationBn.length < 2) flag("organization", "প্রতিষ্ঠানের নাম পাওয়া যায়নি", true);

  const endAt = parseDateTimeLoose(x.application_end_at, "17:00");
  if (!endAt) flag("application_end_at", "আবেদনের শেষ তারিখ পড়া যায়নি", true);
  let startAt = parseDateTimeLoose(x.application_start_at, "10:00");
  if (x.application_start_at && !startAt) flag("application_start_at", "শুরুর তারিখ পড়া যায়নি");
  if (startAt && endAt && startAt >= endAt) {
    flag("application_start_at", "শুরুর তারিখ শেষ তারিখের পরে — বাদ দেওয়া হয়েছে");
    startAt = null;
  }
  if (endAt && new Date(endAt).getTime() <= now) flag("application_end_at", "শেষ তারিখ পেরিয়ে গেছে");
  const publishedOn = parseDateLoose(x.published_on);
  const ageReferenceDate = parseDateLoose(x.age_reference_date);
  if (x.age_reference_date && !ageReferenceDate) flag("age_reference_date", "বয়স গণনার তারিখ পড়া যায়নি");

  let applyUrl = x.apply_url?.trim() || null;
  if (applyUrl && !/^https?:\/\/[^\s]+$/i.test(applyUrl)) {
    flag("apply_url", "আবেদনের লিংক ঠিক নেই");
    applyUrl = null;
  }

  const posts: NormalizedPost[] = [];
  x.posts.forEach((p, i) => {
    const f = (k: string) => `posts.${i}.${k}`;
    const vac = int(p.vacancies);
    const title = (p.title_bn ?? p.title_en ?? "").trim();
    if (!title) return flag(f("title"), "পদের নাম নেই");
    if (vac == null || vac <= 0 || vac > 100_000) return flag(f("vacancies"), "পদসংখ্যা ঠিক নেই");
    let salaryMin = int(p.salary_min);
    let salaryMax = int(p.salary_max);
    const sane = (s: number | null) => s == null || (s >= 1000 && s <= 1_000_000);
    if (!sane(salaryMin) || !sane(salaryMax) || (salaryMin != null && salaryMax != null && salaryMin > salaryMax)) {
      flag(f("salary"), "বেতনের সংখ্যা অস্বাভাবিক — বাদ দেওয়া হয়েছে");
      salaryMin = salaryMax = null;
    }
    let ageMin = int(p.age_min);
    let ageMax = int(p.age_max);
    if ((ageMin != null && (ageMin < 14 || ageMin > 70)) || (ageMax != null && (ageMax < 14 || ageMax > 70)) || (ageMin != null && ageMax != null && ageMin > ageMax)) {
      flag(f("age"), "বয়সসীমা অস্বাভাবিক — বাদ দেওয়া হয়েছে");
      ageMin = ageMax = null;
    }
    const edu = education(p.min_education);
    if (p.min_education && !edu) flag(f("min_education"), "শিক্ষাগত যোগ্যতা চেনা যায়নি");
    const districtIds: string[] = [];
    for (const name of p.eligible_districts ?? []) {
      const id = districtIdFor(name, districts);
      if (id) districtIds.push(id);
      else flag(f("eligible_districts"), `অচেনা জেলা: ${name}`);
    }
    posts.push({
      titleBn: title.slice(0, 150),
      titleEn: (p.title_en ?? "").slice(0, 150),
      vacancies: vac,
      grade: p.grade ? toEnDigits(p.grade).slice(0, 30) : null,
      salaryMin,
      salaryMax,
      salaryText: p.salary_text?.slice(0, 120) ?? (salaryMin == null && salaryMax == null ? "উল্লেখ নেই" : null),
      minEducation: edu ?? "ssc",
      subjects: (p.subjects ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 20),
      experienceYears: Math.max(0, Math.min(40, int(p.experience_years) ?? 0)),
      ageMin,
      ageMax,
      ageRelaxations: (p.relaxations ?? [])
        .map((r) => ({ categoryBn: r.category.slice(0, 60), extraYears: int(r.extra_years) ?? 0 }))
        .filter((r) => r.extraYears > 0 && r.extraYears <= 10),
      eligibleDistrictIds: [...new Set(districtIds)],
      gender: p.gender === "male" || p.gender === "female" ? p.gender : /নারী|মহিলা|female/i.test(p.gender ?? "") ? "female" : /পুরুষ|male/i.test(p.gender ?? "") ? "male" : "any",
      otherRequirements: (p.other_requirements ?? []).map((s) => s.slice(0, 200)).slice(0, 20),
      keywordsEn: (p.keywords_en ?? []).map((s) => s.trim()).filter((s) => s && s.length <= 40).slice(0, 30),
    });
  });
  if (posts.length === 0) flag("posts", "কমপক্ষে একটি বৈধ পদ দরকার", true);

  const feeText = x.fee_text?.slice(0, 120) ?? null;
  const fee = feeText ? int(/(\d[\d,]*)/.exec(toEnDigits(feeText))?.[1]) : null;
  const confidence = Math.min(1, Math.max(0, x.overall_confidence ?? 0));
  return {
    value: {
      organizationBn,
      organizationEn: (x.organization_en ?? "").trim(),
      noticeNo: x.notice_no?.trim().slice(0, 120) || null,
      titleBn: titleBn.slice(0, 200),
      titleEn: (x.title_en ?? "").slice(0, 200),
      publishedOn,
      startAt,
      endAt,
      ageReferenceDate,
      applyUrl,
      applyPlatform: platform(x.apply_platform, applyUrl),
      feeText,
      applicationFee: fee != null && fee <= 100_000 ? fee : null,
      posts,
      confidence: flags.some((f) => f.critical) ? 0 : flags.length ? Math.min(confidence, 0.7) : confidence,
    },
    flags,
  };
}

/** Best-effort extraction without AI (fallback): enough for a moderator to finish by hand. */
export function heuristicExtraction(text: string): Extraction {
  const t = toEnDigits(text);
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const notice = /(?:স্মারক(?:\s*নং)?|নং|notice no\.?|memo no\.?|সূত্র)\s*[:：]?\s*([^\n]{4,80})/i.exec(t)?.[1]?.trim() ?? null;
  const end = /(?:শেষ তারিখ|শেষ সময়|last date|deadline|পর্যন্ত)[^\n]{0,40}?(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}\s+\S+\s+\d{4})/i.exec(t)?.[1] ?? null;
  const start = /(?:শুরু|start)[^\n]{0,40}?(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}\s+\S+\s+\d{4})/i.exec(t)?.[1] ?? null;
  const url = /https?:\/\/[^\s)]+/.exec(t)?.[0] ?? null;
  return {
    organization_bn: lines.find((l) => /কার্যালয়|অধিদপ্তর|মন্ত্রণালয়|বিভাগ|ব্যাংক|কর্পোরেশন|office|ministry|directorate|bank/i.test(l))?.slice(0, 150) ?? null,
    organization_en: null,
    notice_no: notice,
    title_bn: lines.find((l) => /নিয়োগ|বিজ্ঞপ্তি|recruitment|circular/i.test(l))?.slice(0, 200) ?? lines[0]?.slice(0, 200) ?? null,
    title_en: null,
    published_on: null,
    application_start_at: start,
    application_end_at: end,
    age_reference_date: null,
    apply_url: url,
    apply_platform: /teletalk/i.test(t) ? "teletalk" : null,
    fee_text: null,
    posts: [],
    field_confidence: null,
    overall_confidence: 0,
  };
}
