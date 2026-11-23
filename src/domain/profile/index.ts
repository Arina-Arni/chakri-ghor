import type { Profile } from "@/types";

type CompletenessInput = Pick<
  Profile,
  | "fullName"
  | "dateOfBirth"
  | "gender"
  | "phone"
  | "homeDistrictId"
  | "headline"
  | "summary"
  | "educations"
  | "experiences"
  | "skills"
  | "preferences"
>;

/** Share of profile items filled in, and the Bangla names of what's missing. */
export function profileCompleteness(p: CompletenessInput): { pct: number; missing: string[] } {
  const items: [boolean, string][] = [
    [Boolean(p.fullName), "নাম"],
    [Boolean(p.dateOfBirth), "জন্ম তারিখ"],
    [Boolean(p.gender), "লিঙ্গ"],
    [Boolean(p.phone), "মোবাইল নম্বর"],
    [Boolean(p.homeDistrictId), "নিজ জেলা"],
    [Boolean(p.headline), "পেশাগত শিরোনাম"],
    [Boolean(p.summary), "সংক্ষিপ্ত পরিচিতি"],
    [p.educations.length > 0, "শিক্ষাগত যোগ্যতা"],
    [p.experiences.length > 0, "কাজের অভিজ্ঞতা"],
    [p.skills.length >= 3, "কমপক্ষে ৩টি দক্ষতা"],
    [p.preferences.categoryIds.length > 0, "পছন্দের ক্যাটাগরি"],
    [p.preferences.minSalary != null, "ন্যূনতম বেতনের পছন্দ"],
  ];
  const done = items.filter(([ok]) => ok).length;
  return { pct: Math.round((done / items.length) * 100), missing: items.filter(([ok]) => !ok).map(([, l]) => l) };
}

/** Normalize a skill for de-duplication: trimmed, single spaces. Case is kept for display. */
export function normalizeSkill(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => [...p][0]).join("") || "?";
}
