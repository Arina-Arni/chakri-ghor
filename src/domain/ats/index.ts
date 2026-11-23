import type { AtsLabel, AtsResult, ResumeContent } from "@/types";
import { EN_ALIASES, translateKeyword } from "./dictionary";

export { translateKeyword, BN_EN_KEYWORDS } from "./dictionary";

export type PostKeywords = { required: string[]; preferred: string[] };

const WEIGHTS = { required: 60, preferred: 20, sections: 10, format: 10 } as const;

function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/[-./]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** Plain text of every resume field, normalized for phrase matching. */
export function resumeText(content: ResumeContent): string {
  const parts = [
    content.headline,
    content.summary,
    ...content.skills,
    ...content.experience.flatMap((e) => [e.title, e.organization, ...e.bullets]),
    ...content.education.flatMap((e) => [e.degree, e.institution]),
    ...content.certifications,
    ...content.languages,
  ];
  return normalize(parts.join(" \n "));
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const p = normalize(phrase);
  return p.trim().length > 0 && haystack.includes(p);
}

/** True when the resume mentions the keyword (after translation) or one of its aliases. */
export function hasKeyword(haystack: string, keyword: string): boolean {
  const en = translateKeyword(keyword);
  const key = en.toLowerCase();
  const variants = [en, ...(EN_ALIASES[key] ?? [])];
  return variants.some((v) => containsPhrase(haystack, v));
}

function coverage(haystack: string, keywords: string[]) {
  const unique = [...new Set(keywords.map(translateKeyword))];
  const matched = unique.filter((k) => hasKeyword(haystack, k));
  const missing = unique.filter((k) => !matched.includes(k));
  return { ratio: unique.length === 0 ? 1 : matched.length / unique.length, matched, missing };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+?880|0)1[3-9]\d{8}$/;

function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** Share (0–1) of the expected sections that are filled in. */
export function sectionCompleteness(c: ResumeContent): number {
  const checks = [
    Boolean(c.contact.fullName.trim() && c.contact.email.trim() && c.contact.phone.trim()),
    wordCount(c.summary) > 0,
    c.skills.filter((s) => s.trim()).length >= 3,
    c.experience.length > 0,
    c.education.length > 0,
  ];
  return checks.filter(Boolean).length / checks.length;
}

/** Share (0–1) of simple ATS format rules that pass. */
export function formatChecks(c: ResumeContent): number {
  const bullets = c.experience.flatMap((e) => e.bullets).filter((b) => b.trim());
  const phone = c.contact.phone.replace(/[\s-]/g, "");
  const summaryWords = wordCount(c.summary);
  const checks = [
    EMAIL_RE.test(c.contact.email.trim()),
    PHONE_RE.test(phone),
    summaryWords >= 20 && summaryWords <= 120,
    bullets.length > 0 && bullets.every((b) => wordCount(b) <= 40),
  ];
  return checks.filter(Boolean).length / checks.length;
}

export function atsLabel(score: number): AtsLabel {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  return "needs_work";
}

/**
 * Deterministic ATS score (never AI):
 * required keywords 60% + preferred keywords 20% + section completeness 10% + format 10%.
 */
export function computeAtsScore(content: ResumeContent, keywords: PostKeywords): AtsResult {
  const text = resumeText(content);
  const req = coverage(text, keywords.required);
  const pref = coverage(text, keywords.preferred);
  const sections = sectionCompleteness(content);
  const format = formatChecks(content);
  const breakdown = {
    required: Math.round(req.ratio * WEIGHTS.required),
    preferred: Math.round(pref.ratio * WEIGHTS.preferred),
    sections: Math.round(sections * WEIGHTS.sections),
    format: Math.round(format * WEIGHTS.format),
  };
  const score = Math.max(
    0,
    Math.min(100, breakdown.required + breakdown.preferred + breakdown.sections + breakdown.format),
  );
  return {
    score,
    label: atsLabel(score),
    matched: [...req.matched, ...pref.matched],
    missing: [...req.missing, ...pref.missing],
    breakdown,
  };
}
