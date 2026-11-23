import { ageOn, formatDateBn, toBnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import { EDUCATION_LEVELS } from "@/types";
import type {
  AgeRelaxation,
  CircularPost,
  EducationLevel,
  EligibilityCheck,
  EligibilityResult,
  Profile,
  SpecialCategory,
} from "@/types";

export type EligibilityProfile = Pick<
  Profile,
  "dateOfBirth" | "gender" | "homeDistrictId" | "specialCategories" | "educations" | "experiences"
>;

export type EligibilityPost = Pick<
  CircularPost,
  | "id"
  | "minEducation"
  | "subjects"
  | "experienceYears"
  | "ageMin"
  | "ageMax"
  | "ageRelaxations"
  | "eligibleDistrictIds"
  | "eligibleDivisionIds"
  | "gender"
  | "manualChecks"
>;

export type EligibilityCircular = {
  startAt: string;
  endAt: string;
  /** Age is counted on this date; falls back to the publish date (DECISIONS D21). */
  ageReferenceDate: string | null;
  publishedOn: string | null;
};

export type DistrictInfo = { id: string; divisionId: string; nameBn: string };

/** class_8 < ssc < hsc = diploma < bachelor < masters < phd */
const RANK: Record<EducationLevel, number> = {
  class_8: 0,
  ssc: 1,
  hsc: 2,
  diploma: 2,
  bachelor: 3,
  masters: 4,
  phd: 5,
};

export function educationRank(level: EducationLevel): number {
  return RANK[level];
}

/** Highest education level in the list, or null. */
export function highestEducation(levels: EducationLevel[]): EducationLevel | null {
  let best: EducationLevel | null = null;
  for (const l of levels) if (best == null || RANK[l] > RANK[best]) best = l;
  return best;
}

/** Words that identify a special quota in a relaxation's free-text label. */
const QUOTA_WORDS: Record<SpecialCategory, RegExp> = {
  freedom_fighter_family: /মুক্তিযোদ্ধা|freedom/i,
  ethnic_minority: /নৃ-?গোষ্ঠী|উপজাতি|ethnic|tribal/i,
  disability: /প্রতিবন্ধী|disab/i,
  orphan: /এতিম|orphan/i,
  ansar_vdp: /আনসার|ভিডিপি|ansar|vdp/i,
};

/** Which special category a relaxation label refers to, if any. */
export function relaxationCategory(r: AgeRelaxation): SpecialCategory | null {
  for (const [cat, re] of Object.entries(QUOTA_WORDS) as [SpecialCategory, RegExp][]) {
    if (re.test(r.categoryBn) || r.categoryBn === t(`enums.specialCategory.${cat}`)) return cat;
  }
  return null;
}

/** Upper age limit after the best relaxation the user qualifies for. */
export function effectiveAgeMax(post: EligibilityPost, specialCategories: SpecialCategory[]): {
  ageMax: number | null;
  relaxedBy: AgeRelaxation | null;
} {
  if (post.ageMax == null) return { ageMax: null, relaxedBy: null };
  let best: AgeRelaxation | null = null;
  for (const r of post.ageRelaxations) {
    const cat = relaxationCategory(r);
    if (cat && specialCategories.includes(cat) && (!best || r.extraYears > best.extraYears)) best = r;
  }
  return { ageMax: post.ageMax + (best?.extraYears ?? 0), relaxedBy: best };
}

export function ageTextBn(a: { years: number; months: number; days: number }): string {
  return `${toBnDigits(a.years)} বছর ${toBnDigits(a.months)} মাস ${toBnDigits(a.days)} দিন`;
}

const DAY_MS = 86_400_000;

/** Total experience in years, counting overlapping periods once. */
export function experienceYears(
  experiences: Pick<Profile["experiences"][number], "startDate" | "endDate" | "current">[],
  now: number,
): number {
  const spans = experiences
    .map((e) => {
      const start = Date.parse(`${e.startDate}T00:00:00Z`);
      const end = e.current || !e.endDate ? now : Date.parse(`${e.endDate}T00:00:00Z`) + DAY_MS;
      return [start, Math.min(end, now)] as const;
    })
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, e] of spans) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) curEnd = e;
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total / (365.2425 * DAY_MS);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Check one post against a profile (spec §4.3). Pure: the same function backs the panel,
 * the "শুধু আমার যোগ্য" filter and recommendations.
 */
export function computeEligibility(
  circular: EligibilityCircular,
  post: EligibilityPost,
  profile: EligibilityProfile,
  now: number,
  districts: ReadonlyMap<string, DistrictInfo>,
): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  let age: EligibilityResult["age"] = null;

  // ── Age on the reference date ──
  const refDate = circular.ageReferenceDate ?? circular.publishedOn;
  if (post.ageMin == null && post.ageMax == null) {
    checks.push({ key: "age", status: "pass", messageBn: "বয়সসীমা নেই" });
  } else if (!profile.dateOfBirth) {
    checks.push({ key: "age", status: "unknown", messageBn: "জন্ম তারিখ প্রোফাইলে নেই — প্রোফাইলে যোগ করুন" });
  } else if (!refDate) {
    checks.push({ key: "age", status: "unknown", messageBn: "বয়স গণনার তারিখ সার্কুলারে নেই" });
  } else {
    const a = ageOn(profile.dateOfBirth, refDate);
    age = { ...a, referenceDate: refDate };
    const { ageMax, relaxedBy } = effectiveAgeMax(post, profile.specialCategories);
    const tooYoung = post.ageMin != null && a.years < post.ageMin;
    // Over the limit by even one day fails: exactly `ageMax` years 0 months 0 days is the last eligible day.
    const tooOld = ageMax != null && (a.years > ageMax || (a.years === ageMax && (a.months > 0 || a.days > 0)));
    const limit =
      post.ageMin != null && ageMax != null
        ? `${toBnDigits(post.ageMin)}–${toBnDigits(ageMax)} বছর`
        : ageMax != null
          ? `সর্বোচ্চ ${toBnDigits(ageMax)} বছর`
          : `কমপক্ষে ${toBnDigits(post.ageMin!)} বছর`;
    const relaxNote = relaxedBy ? ` (${relaxedBy.categoryBn} কোটায় ${toBnDigits(relaxedBy.extraYears)} বছর শিথিল)` : "";
    const yours = `${formatDateBn(refDate)} তারিখে আপনার বয়স ${ageTextBn(a)}`;
    checks.push(
      tooYoung || tooOld
        ? { key: "age", status: "fail", messageBn: `বয়সসীমা ${limit}${relaxNote}; ${yours}` }
        : { key: "age", status: "pass", messageBn: `বয়সসীমা ${limit}${relaxNote} — ${yours}` },
    );
  }

  // ── Education ──
  const best = highestEducation(profile.educations.map((e) => e.level));
  if (!best) {
    checks.push({ key: "education", status: "unknown", messageBn: "শিক্ষাগত যোগ্যতা প্রোফাইলে নেই" });
  } else if (RANK[best] >= RANK[post.minEducation]) {
    checks.push({ key: "education", status: "pass", messageBn: `ন্যূনতম ${t(`enums.education.${post.minEducation}`)} — আপনার আছে` });
  } else {
    checks.push({
      key: "education",
      status: "fail",
      messageBn: `ন্যূনতম ${t(`enums.education.${post.minEducation}`)} দরকার; আপনার সর্বোচ্চ ${t(`enums.education.${best}`)}`,
    });
  }

  // ── Subject: unknown (not fail) when the profile has no subject to compare ──
  if (post.subjects.length > 0) {
    const mine = profile.educations
      .filter((e) => RANK[e.level] >= RANK[post.minEducation])
      .map((e) => norm(e.subject))
      .filter(Boolean);
    const wanted = post.subjects.map(norm);
    if (mine.length === 0) {
      checks.push({ key: "subject", status: "unknown", messageBn: `চাওয়া বিষয়: ${post.subjects.join(", ")} — প্রোফাইলে আপনার বিষয় নেই` });
    } else if (mine.some((m) => wanted.some((w) => m.includes(w) || w.includes(m)))) {
      checks.push({ key: "subject", status: "pass", messageBn: "বিষয় মিলেছে" });
    } else {
      checks.push({ key: "subject", status: "fail", messageBn: `চাওয়া বিষয়: ${post.subjects.join(", ")}` });
    }
  }

  // ── District / division (home district = স্থায়ী ঠিকানা) ──
  const restricted = (post.eligibleDistrictIds?.length ?? 0) > 0 || (post.eligibleDivisionIds?.length ?? 0) > 0;
  if (!restricted) {
    checks.push({ key: "district", status: "pass", messageBn: "সব জেলার প্রার্থী আবেদন করতে পারবেন" });
  } else {
    const home = profile.homeDistrictId ? districts.get(profile.homeDistrictId) : undefined;
    if (!home) {
      checks.push({ key: "district", status: "unknown", messageBn: "নিজ জেলা (স্থায়ী ঠিকানা) প্রোফাইলে নেই" });
    } else {
      const okDistrict = post.eligibleDistrictIds?.includes(home.id) ?? false;
      const okDivision = post.eligibleDivisionIds?.includes(home.divisionId) ?? false;
      checks.push(
        okDistrict || okDivision
          ? { key: "district", status: "pass", messageBn: `${home.nameBn} জেলার প্রার্থীরা আবেদন করতে পারবেন` }
          : { key: "district", status: "fail", messageBn: `${home.nameBn} জেলা এই পদের যোগ্য তালিকায় নেই` },
      );
    }
  }

  // ── Gender ──
  if (post.gender !== "any") {
    if (!profile.gender) {
      checks.push({ key: "gender", status: "unknown", messageBn: "লিঙ্গ প্রোফাইলে নেই" });
    } else {
      checks.push(
        profile.gender === post.gender
          ? { key: "gender", status: "pass", messageBn: t(`enums.genderRule.${post.gender}`) }
          : { key: "gender", status: "fail", messageBn: `এই পদ ${t(`enums.genderRule.${post.gender}`)}` },
      );
    }
  }

  // ── Experience (non-overlapping periods) ──
  if (post.experienceYears > 0) {
    const years = experienceYears(profile.experiences, now);
    checks.push(
      years + 1e-9 >= post.experienceYears
        ? { key: "experience", status: "pass", messageBn: `${toBnDigits(post.experienceYears)} বছরের অভিজ্ঞতা দরকার — আপনার আছে` }
        : {
            key: "experience",
            status: "fail",
            messageBn: `${toBnDigits(post.experienceYears)} বছরের অভিজ্ঞতা দরকার; আপনার প্রায় ${toBnDigits(Math.floor(years * 10) / 10)} বছর`,
          },
    );
  }

  // ── Application window ──
  const start = new Date(circular.startAt).getTime();
  const end = new Date(circular.endAt).getTime();
  checks.push(
    now >= end
      ? { key: "deadline", status: "fail", messageBn: "আবেদনের সময় শেষ" }
      : now < start
        ? { key: "deadline", status: "unknown", messageBn: `আবেদন এখনো শুরু হয়নি — শুরু ${formatDateBn(circular.startAt)}` }
        : { key: "deadline", status: "pass", messageBn: `শেষ সময় ${formatDateBn(circular.endAt)}` },
  );

  const verdict = checks.some((c) => c.status === "fail")
    ? "not_eligible"
    : checks.some((c) => c.status === "unknown")
      ? "needs_info"
      : "eligible";

  return {
    postId: post.id,
    verdict,
    checks,
    age,
    manualChecks: post.manualChecks,
    computedAt: new Date(now).toISOString(),
  };
}

/** Same rule as the "শুধু আমার যোগ্য" filter: a post counts unless it is definitely not eligible. */
export function passesEligibleOnly(result: EligibilityResult): boolean {
  return result.verdict !== "not_eligible";
}

export { EDUCATION_LEVELS };
