import { keywordCoverage } from "@/domain/ats";
import { toBnDigits } from "@/domain/bn";

export type MatchInput = {
  eligible: boolean;
  /** Districts the circular is for (its own district and posts' eligible districts). */
  circularDistrictIds: string[];
  categoryId: string;
  /** English keywords of the circular's posts. */
  keywords: string[];
  endAt: string;
};

export type MatchProfile = {
  homeDistrictId: string | null;
  preferredDistrictIds: string[];
  preferredCategoryIds: string[];
  skills: string[];
};

export type MatchScore = { score: number; reasonsBn: string[] };

const CLOSE_DEADLINE_MS = 48 * 60 * 60 * 1000;

/**
 * Deterministic recommendation score (spec §4.4):
 * eligible +40, home/preferred district +20, preferred category +20,
 * skill-keyword overlap +0–15, deadline not too close +5. Max 100.
 */
export function matchScore(c: MatchInput, p: MatchProfile, now: number): MatchScore {
  const parts: { points: number; reason: string }[] = [];
  if (c.eligible) parts.push({ points: 40, reason: "আপনি যোগ্য" });

  if (p.homeDistrictId && c.circularDistrictIds.includes(p.homeDistrictId)) {
    parts.push({ points: 20, reason: "আপনার জেলা" });
  } else if (c.circularDistrictIds.some((d) => p.preferredDistrictIds.includes(d))) {
    parts.push({ points: 20, reason: "পছন্দের জেলা" });
  }

  if (p.preferredCategoryIds.includes(c.categoryId)) parts.push({ points: 20, reason: "পছন্দের ক্যাটাগরি" });

  if (c.keywords.length > 0 && p.skills.length > 0) {
    const { matched, ratio } = keywordCoverage(p.skills, c.keywords);
    const points = Math.round(15 * ratio);
    if (points > 0) parts.push({ points, reason: `${toBnDigits(matched.length)}টি দক্ষতা মিলেছে` });
  }

  if (new Date(c.endAt).getTime() - now > CLOSE_DEADLINE_MS) parts.push({ points: 5, reason: "হাতে সময় আছে" });

  const score = parts.reduce((n, x) => n + x.points, 0);
  const reasonsBn = [...parts].sort((a, b) => b.points - a.points).map((x) => x.reason).slice(0, 3);
  return { score, reasonsBn };
}
