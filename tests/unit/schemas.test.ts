import { describe, expect, it } from "vitest";
import {
  circularSchema,
  extendDeadlineSchema,
  phoneBd,
  postSchema,
  profileStep1Schema,
  signupSchema,
  validateFile,
  CV_FILE,
} from "@/schemas";
import { passwordStrength } from "@/schemas/auth";
import { t } from "@/i18n";

const post = {
  id: "p1",
  titleBn: "অফিস সহকারী",
  titleEn: "",
  vacancies: "১২",
  grade: "",
  salaryMin: "৯৩০০",
  salaryMax: "22490",
  salaryText: "",
  minEducation: "hsc" as const,
  subjectsText: "",
  experienceYears: "0",
  ageMin: "18",
  ageMax: "৩০",
  ageRelaxations: [],
  eligibleDistrictIds: [],
  eligibleDivisionIds: [],
  gender: "any" as const,
  otherRequirements: [],
  keywordsRequired: [],
  keywordsPreferred: [],
};

const circular = {
  organizationId: "org1",
  noticeNo: "05.01.0000",
  titleBn: "নিয়োগ বিজ্ঞপ্তি",
  titleEn: "",
  descriptionBn: "",
  sector: "government" as const,
  jobType: "full_time" as const,
  workMode: "onsite" as const,
  startAt: { date: "০১/১২/২০২৬", time: "১০:০০" },
  endAt: { date: "৩১/১২/২০২৬", time: "১৭:০০" },
  ageReferenceDate: "01/12/2026",
  applyUrl: "https://dc.teletalk.com.bd",
  applyPlatform: "teletalk" as const,
  applicationFee: "১১২",
  sourceUrl: "",
  posts: [post],
  categoryId: "c1",
  tagSlugs: [],
  divisionId: "",
  districtId: "",
};

describe("i18n", () => {
  it("interpolates with Bangla digits", () => {
    expect(t("jobs.resultCount", { n: 124 })).toBe("১২৪টি চাকরি");
    expect(t("common.reference", { id: "REQ-12" })).toBe("রেফারেন্স: REQ-12");
  });
});

describe("phone", () => {
  it("accepts local, +880 and Bangla digit forms", () => {
    expect(phoneBd.parse("01712345678")).toBe("01712345678");
    expect(phoneBd.parse("+8801712345678")).toBe("01712345678");
    expect(phoneBd.parse("০১৭১২-৩৪৫৬৭৮")).toBe("01712345678");
  });
  it("rejects invalid operators and lengths", () => {
    expect(phoneBd.safeParse("01212345678").success).toBe(false);
    expect(phoneBd.safeParse("0171234567").success).toBe(false);
  });
});

describe("profile step 1", () => {
  const base = {
    fullName: "রহিমা আক্তার",
    dateOfBirth: "০২/০১/১৯৯৫",
    gender: "female" as const,
    phone: "01712345678",
    homeDistrictId: "d1",
    currentDistrictId: "d1",
    specialCategories: [],
  };
  it("normalizes a Bangla-digit birth date", () => {
    const r = profileStep1Schema.parse(base);
    expect(r.dateOfBirth).toBe("1995-01-02");
  });
  it("rejects future dates, under-15s and impossible dates", () => {
    expect(profileStep1Schema.safeParse({ ...base, dateOfBirth: "01/01/2090" }).success).toBe(false);
    const young = new Date().getFullYear() - 10;
    expect(profileStep1Schema.safeParse({ ...base, dateOfBirth: `01/01/${young}` }).success).toBe(false);
    const r = profileStep1Schema.safeParse({ ...base, dateOfBirth: "31/02/1995" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe(t("validation.impossibleDate"));
  });
});

describe("circular", () => {
  it("parses Bangla digits in numbers and Dhaka date-times", () => {
    const r = circularSchema.parse(circular);
    expect(r.startAt).toBe("2026-12-01T04:00:00.000Z");
    expect(r.posts[0].vacancies).toBe(12);
    expect(r.posts[0].salaryMin).toBe(9300);
    expect(r.applicationFee).toBe(112);
  });
  it("requires the end after the start", () => {
    const r = circularSchema.safeParse({ ...circular, endAt: { date: "01/11/2026", time: "10:00" } });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.message === t("validation.endAfterStart"))).toBe(true);
  });
  it("requires the age reference date on or before the end date", () => {
    const r = circularSchema.safeParse({ ...circular, ageReferenceDate: "01/01/2027" });
    expect(r.error?.issues.some((i) => i.message === t("validation.ageRefBeforeEnd"))).toBe(true);
  });
  it("checks post ranges and vacancies", () => {
    expect(postSchema.safeParse({ ...post, ageMin: "35", ageMax: "30" }).success).toBe(false);
    expect(postSchema.safeParse({ ...post, salaryMin: "50000", salaryMax: "1000" }).success).toBe(false);
    expect(postSchema.safeParse({ ...post, vacancies: "0" }).success).toBe(false);
  });
  it("requires an extended deadline to be later", () => {
    const s = extendDeadlineSchema("2026-12-31T11:00:00.000Z");
    expect(s.safeParse({ newEnd: { date: "30/12/2026", time: "17:00" } }).success).toBe(false);
    expect(s.safeParse({ newEnd: { date: "07/01/2027", time: "17:00" } }).success).toBe(true);
  });
});

describe("auth", () => {
  it("requires terms and a reasonable password", () => {
    const ok = { fullName: "রহিম", email: "a@b.co", password: "abcd1234", terms: true };
    expect(signupSchema.safeParse(ok).success).toBe(true);
    expect(signupSchema.safeParse({ ...ok, terms: false }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, password: "abcdefgh" }).success).toBe(false);
  });
  it("scores password strength", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abcd1234")).toBe(2);
    expect(passwordStrength("Abcd1234!xyz")).toBe(4);
  });
});

describe("files", () => {
  it("checks type and size", () => {
    expect(validateFile({ name: "cv.pdf", type: "application/pdf", size: 1000 }, CV_FILE)).toBeNull();
    expect(validateFile({ name: "cv.png", type: "image/png", size: 1000 }, CV_FILE)).toMatch("PDF");
    expect(validateFile({ name: "cv.pdf", type: "application/pdf", size: 6 * 1024 * 1024 }, CV_FILE)).toMatch("৫");
  });
});
