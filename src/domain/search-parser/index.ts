import { formatNumberBn, toEnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import type { Category, District, Division, EducationLevel, JobFilters, ParsedSearch, SearchChip } from "@/types";

export type ParserTaxonomy = {
  districts: Pick<District, "id" | "nameBn" | "nameEn" | "aliases">[];
  divisions: (Pick<Division, "id" | "nameBn" | "nameEn"> & { aliases?: string[] })[];
  categories: Pick<Category, "id" | "nameBn">[];
};

const STOPWORDS = new Set([
  "চাকরি", "চাকরির", "চাকুরি", "চাকুরী", "জব", "job", "jobs", "chakri", "pase", "পাসে", "পাস", "বেতনের", "বেতন",
  "এর", "ও", "এবং", "জন্য", "in", "the", "a", "an", "with", "for", "at", "of", "জেলা", "জেলায়", "বিভাগ", "বিভাগে",
]);
const SUFFIXES = ["গুলোর", "দের", "েরে", "ের", "য়ে", "র", "য়", "তে", "কে", "এ"];

function stem(token: string): string {
  for (const s of SUFFIXES) if (token.length > s.length + 2 && token.endsWith(s)) return token.slice(0, -s.length);
  return token;
}

/** Category keyword table. Ids match the seeded categories. */
export const CATEGORY_WORDS: [RegExp, string][] = [
  [/ব্যাংক|bank|ফিন্যান্স|finance|আর্থিক/i, "cat_bank"],
  [/শিক্ষক|teacher|শিক্ষা|প্রভাষক|lecturer/i, "cat_edu"],
  [/নার্স|ডাক্তার|স্বাস্থ্য|health|nurse|হাসপাতাল|medical|মেডিকেল/i, "cat_health"],
  [/ইঞ্জিনিয়ার|প্রকৌশল|engineer/i, "cat_eng"],
  [/ডেভেলপার|developer|সফটওয়্যার|software|প্রোগ্রামার|programmer|কম্পিউটার|computer|\bit\b|আইটি/i, "cat_it"],
  [/পুলিশ|police|আর্মি|army|সেনা|নৌ|বিমান|আনসার|প্রতিরক্ষা|defen[cs]e/i, "cat_defense"],
  [/এনজিও|ngo|উন্নয়ন/i, "cat_ngo"],
  [/কৃষি|agri|মৎস্য|প্রাণিসম্পদ/i, "cat_agri"],
  [/মার্কেটিং|marketing|বিক্রয়|sales/i, "cat_sales"],
  [/অফিস|office|প্রশাসন|admin|সহকারী|assistant|ক্লার্ক|clerk/i, "cat_admin"],
];

const EDU_WORDS: [RegExp, EducationLevel][] = [
  [/অষ্টম|class\s*8|জেএসসি|jsc/i, "class_8"],
  [/এসএসসি|ssc|মাধ্যমিক/i, "ssc"],
  [/এইচএসসি|hsc|উচ্চ মাধ্যমিক|ইন্টার/i, "hsc"],
  [/ডিপ্লোমা|diploma/i, "diploma"],
  [/স্নাতকোত্তর|মাস্টার্স|masters|post\s*grad/i, "masters"],
  [/স্নাতক|অনার্স|graduate|bachelor|honou?rs|ডিগ্রি/i, "bachelor"],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Find a name as a whole word (Bangla words may carry suffixes like -এ, -র). */
function findName(haystack: string, name: string): RegExpExecArray | null {
  const n = name.toLowerCase().trim();
  if (n.length < 2) return null;
  return new RegExp(`(^|[\\s,।])${escapeRe(n)}[\\p{L}\\p{M}]{0,4}(?=$|[\\s,।])`, "u").exec(haystack);
}

/**
 * Rule-based query understanding (spec §5.1). Turns "খুলনায় সরকারি অফিস সহকারী ৩০ হাজার+"
 * into filters + chips. Used alone in Part 2 (`mode: "fallback"`); Part 3 puts the AI in front.
 */
export function parseQueryRules(text: string, tax: ParserTaxonomy): Omit<ParsedSearch, "mode"> {
  const filters: JobFilters = {};
  const chips: SearchChip[] = [];
  let rest = ` ${toEnDigits(text).toLowerCase().replace(/\s+/g, " ")} `;
  let hits = 0;

  const cut = (m: RegExpExecArray) => {
    rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
  };

  // Districts first (more specific than divisions with the same name).
  for (const d of tax.districts) {
    for (const name of [d.nameBn, d.nameEn, ...d.aliases]) {
      const m = findName(rest, name);
      if (m) {
        if (!filters.district?.includes(d.id)) {
          filters.district = [...(filters.district ?? []), d.id];
          chips.push({ key: "district", value: d.id, labelBn: d.nameBn });
          hits++;
        }
        cut(m);
        break;
      }
    }
  }
  for (const v of tax.divisions) {
    for (const name of [`${v.nameBn} বিভাগ`, `${v.nameEn} division`, ...(v.aliases ?? [])]) {
      const m = findName(rest, name);
      if (m) {
        filters.division = [...(filters.division ?? []), v.id];
        chips.push({ key: "division", value: v.id, labelBn: `${v.nameBn} বিভাগ` });
        cut(m);
        hits++;
        break;
      }
    }
  }

  if (/বেসরকারি|প্রাইভেট|private/i.test(rest)) {
    filters.sector = ["private"];
    chips.push({ key: "sector", value: "private", labelBn: t("enums.sector.private") });
    rest = rest.replace(/বেসরকারি|প্রাইভেট|private/gi, " ");
    hits++;
  } else if (/সরকারি|government|govt|sarkari|sorkari/i.test(rest)) {
    filters.sector = ["government"];
    chips.push({ key: "sector", value: "government", labelBn: t("enums.sector.government") });
    rest = rest.replace(/সরকারি|government|govt|sarkari|sorkari/gi, " ");
    hits++;
  }

  for (const [re, id] of CATEGORY_WORDS) {
    const cat = tax.categories.find((c) => c.id === id);
    if (cat && re.test(rest)) {
      filters.category = [id];
      chips.push({ key: "category", value: id, labelBn: cat.nameBn });
      rest = rest.replace(new RegExp(`(?:${re.source})[\\p{L}\\p{M}]*`, "giu"), " ");
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

  // "৫০ হাজার+", "50k", "50 hajar", "৳30000+"
  const salary =
    /(\d+(?:\.\d+)?)\s*(হাজার|hajar|k)\s*(\+|plus|এর বেশি|উপরে)?/i.exec(rest) ?? /৳\s*(\d{4,7})\s*(\+)?/.exec(rest);
  if (salary) {
    const n = /হাজার|hajar|k/i.test(salary[2] ?? "") ? Math.round(Number(salary[1]) * 1000) : Number(salary[1]);
    if (Number.isFinite(n) && n > 0) {
      filters.salaryMin = n;
      chips.push({ key: "salaryMin", value: String(n), labelBn: `৳${formatNumberBn(n)}+` });
      cut(salary);
      hits++;
    }
  }

  if (/রিমোট|remote|বাসা থেকে|work from home|wfh/i.test(rest)) {
    filters.workMode = ["remote"];
    chips.push({ key: "workMode", value: "remote", labelBn: t("enums.workMode.remote") });
    rest = rest.replace(/রিমোট|remote|বাসা থেকে|work from home|wfh/gi, " ");
    hits++;
  }
  if (/ইন্টার্নশিপ|internship/i.test(rest)) {
    filters.jobType = ["internship"];
    chips.push({ key: "jobType", value: "internship", labelBn: t("enums.jobType.internship") });
    rest = rest.replace(/ইন্টার্নশিপ|internship/gi, " ");
    hits++;
  } else if (/পার্ট টাইম|খণ্ডকালীন|part[\s-]?time/i.test(rest)) {
    filters.jobType = ["part_time"];
    chips.push({ key: "jobType", value: "part_time", labelBn: t("enums.jobType.part_time") });
    rest = rest.replace(/পার্ট টাইম|খণ্ডকালীন|part[\s-]?time/gi, " ");
    hits++;
  }
  if (/আজ(?:ই)? শেষ|closing today/i.test(rest)) {
    filters.deadlineWithin = "today";
    chips.push({ key: "deadlineWithin", value: "today", labelBn: t("enums.deadlineWithin.today") });
    rest = rest.replace(/আজ(?:ই)? শেষ|closing today/gi, " ");
    hits++;
  }

  const leftover = rest
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{M}\p{N}+#.-]/gu, ""))
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  if (leftover.length) {
    filters.q = leftover.join(" ");
    chips.push({ key: "q", value: filters.q, labelBn: filters.q });
  }
  const confidence = hits === 0 ? 0.35 : Math.min(0.95, 0.55 + hits * 0.15 - leftover.length * 0.05);
  return { filters, chips, confidence: Math.max(0.3, Number(confidence.toFixed(2))) };
}

/**
 * The trigram-indexed `circulars.search_text`: titles, organization names, post titles and
 * keywords, places, category and tags — lower-cased, single-spaced.
 */
export function buildCircularSearchText(parts: {
  titleBn: string;
  titleEn?: string | null;
  noticeNo?: string | null;
  organization: { nameBn: string; nameEn: string; shortName: string };
  posts: { titleBn: string; titleEn?: string | null; keywords?: string[] }[];
  districtId?: string | null;
  divisionId?: string | null;
  categoryId: string;
  tagLabels?: string[];
  tax: { districts: { id: string; nameBn: string; nameEn: string }[]; divisions: { id: string; nameBn: string; nameEn: string }[]; categories: { id: string; nameBn: string; nameEn?: string }[] };
}): string {
  const district = parts.districtId ? parts.tax.districts.find((d) => d.id === parts.districtId) : null;
  const division = parts.divisionId ? parts.tax.divisions.find((d) => d.id === parts.divisionId) : null;
  const category = parts.tax.categories.find((c) => c.id === parts.categoryId);
  return [
    parts.titleBn,
    parts.titleEn,
    parts.organization.nameBn,
    parts.organization.nameEn,
    parts.organization.shortName,
    parts.noticeNo,
    ...parts.posts.flatMap((p) => [p.titleBn, p.titleEn, ...(p.keywords ?? [])]),
    district?.nameBn,
    district?.nameEn,
    division?.nameBn,
    division?.nameEn,
    category?.nameBn,
    category?.nameEn,
    ...(parts.tagLabels ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a free-text query for logging and grouping: digits, case, spaces. */
export function normalizeQuery(q: string): string {
  return toEnDigits(q).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
}
