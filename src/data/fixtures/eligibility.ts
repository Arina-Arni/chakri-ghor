// TEMP — replaced by the real implementation in Part 2 (eligibility rules engine)
import { ageOn, formatDateBn, toBnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import { EDUCATION_LEVELS } from "@/types";
import type { Circular, CircularPost, EligibilityCheck, EligibilityResult, Profile } from "@/types";
import { districtById } from "./taxonomy";

function levelIndex(l: string) {
  return EDUCATION_LEVELS.indexOf(l as (typeof EDUCATION_LEVELS)[number]);
}

/** Rough sample rules so every verdict and row state can be seen in Part 1. */
export function computeEligibility(c: Circular, post: CircularPost, p: Profile, now: number): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  let age: EligibilityResult["age"] = null;

  // Age on the circular's reference date
  if (!p.dateOfBirth) {
    checks.push({ key: "age", status: "unknown", messageBn: "জন্ম তারিখ প্রোফাইলে নেই" });
  } else {
    const a = ageOn(p.dateOfBirth, c.ageReferenceDate);
    age = { ...a, referenceDate: c.ageReferenceDate };
    const tooYoung = post.ageMin != null && a.years < post.ageMin;
    const over = post.ageMax != null && (a.years > post.ageMax || (a.years === post.ageMax && (a.months > 0 || a.days > 0)));
    const limit =
      post.ageMin != null && post.ageMax != null
        ? `${toBnDigits(post.ageMin)}–${toBnDigits(post.ageMax)} বছর`
        : post.ageMax != null
          ? `সর্বোচ্চ ${toBnDigits(post.ageMax)} বছর`
          : "বয়সসীমা নেই";
    checks.push(
      tooYoung || over
        ? { key: "age", status: "fail", messageBn: `বয়সসীমা ${limit}; ${formatDateBn(c.ageReferenceDate)} তারিখে আপনার বয়স ${toBnDigits(a.years)} বছর` }
        : { key: "age", status: "pass", messageBn: `বয়সসীমা ${limit} — মিলেছে` },
    );
  }

  // Education
  const best = p.educations.reduce((m, e) => Math.max(m, levelIndex(e.level)), -1);
  if (best < 0) checks.push({ key: "education", status: "unknown", messageBn: "শিক্ষাগত যোগ্যতা প্রোফাইলে নেই" });
  else {
    const need = levelIndex(post.minEducation);
    checks.push(
      best >= need
        ? { key: "education", status: "pass", messageBn: `ন্যূনতম ${t(`enums.education.${post.minEducation}`)} — আপনার আছে` }
        : { key: "education", status: "fail", messageBn: `ন্যূনতম ${t(`enums.education.${post.minEducation}`)} দরকার` },
    );
  }

  // Subject
  if (post.subjects.length > 0) {
    const mine = p.educations.map((e) => e.subject.toLowerCase());
    const hit = post.subjects.some((s) => mine.some((m) => m.includes(s.toLowerCase()) || s.toLowerCase().includes(m)));
    checks.push(
      hit
        ? { key: "subject", status: "pass", messageBn: "বিষয় মিলেছে" }
        : { key: "subject", status: "unknown", messageBn: `চাওয়া বিষয়: ${post.subjects.join(", ")} — প্রোফাইলে মেলেনি, নিশ্চিত হোন` },
    );
  }

  // District / division
  const home = p.homeDistrictId ? districtById.get(p.homeDistrictId) : null;
  if (post.eligibleDistrictIds || post.eligibleDivisionIds) {
    if (!home) checks.push({ key: "district", status: "unknown", messageBn: "নিজ জেলা প্রোফাইলে নেই" });
    else {
      const ok =
        (post.eligibleDistrictIds?.includes(home.id) ?? false) ||
        (post.eligibleDivisionIds?.includes(home.divisionId) ?? false);
      checks.push(
        ok
          ? { key: "district", status: "pass", messageBn: `${home.nameBn} জেলার প্রার্থীরা আবেদন করতে পারবেন` }
          : { key: "district", status: "fail", messageBn: `${home.nameBn} জেলা এই পদের যোগ্য তালিকায় নেই` },
      );
    }
  } else {
    checks.push({ key: "district", status: "pass", messageBn: "সব জেলার প্রার্থী আবেদন করতে পারবেন" });
  }

  // Gender
  if (post.gender !== "any") {
    if (!p.gender) checks.push({ key: "gender", status: "unknown", messageBn: "লিঙ্গ প্রোফাইলে নেই" });
    else
      checks.push(
        p.gender === post.gender
          ? { key: "gender", status: "pass", messageBn: t(`enums.genderRule.${post.gender}`) }
          : { key: "gender", status: "fail", messageBn: `এই পদ ${t(`enums.genderRule.${post.gender}`)}` },
      );
  }

  // Experience
  if (post.experienceYears > 0) {
    const years = p.experiences.reduce((sum, e) => {
      const end = e.current || !e.endDate ? now : new Date(e.endDate).getTime();
      return sum + Math.max(0, end - new Date(e.startDate).getTime()) / (365.25 * 86_400_000);
    }, 0);
    checks.push(
      years >= post.experienceYears
        ? { key: "experience", status: "pass", messageBn: `${toBnDigits(post.experienceYears)} বছরের অভিজ্ঞতা দরকার — আপনার আছে` }
        : { key: "experience", status: "fail", messageBn: `${toBnDigits(post.experienceYears)} বছরের অভিজ্ঞতা দরকার; আপনার প্রায় ${toBnDigits(Math.floor(years))} বছর` },
    );
  }

  // Application window
  const start = new Date(c.startAt).getTime();
  const end = new Date(c.endAt).getTime();
  checks.push(
    now >= end
      ? { key: "deadline", status: "fail", messageBn: "আবেদনের সময় শেষ" }
      : now < start
        ? { key: "deadline", status: "unknown", messageBn: `আবেদন শুরু হবে ${formatDateBn(c.startAt)}` }
        : { key: "deadline", status: "pass", messageBn: `শেষ সময় ${formatDateBn(c.endAt)}` },
  );

  const verdict = checks.some((x) => x.status === "fail")
    ? "not_eligible"
    : checks.some((x) => x.status === "unknown")
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
