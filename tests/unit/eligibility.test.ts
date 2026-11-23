import { describe, expect, it } from "vitest";
import {
  computeEligibility,
  experienceYears,
  highestEducation,
  type EligibilityCircular,
  type EligibilityPost,
  type EligibilityProfile,
} from "@/domain/eligibility";
import { districtById } from "@/domain/taxonomy";

const NOW = Date.parse("2026-11-23T06:00:00Z");
const DAY = 86_400_000;

const circular = (over: Partial<EligibilityCircular> = {}): EligibilityCircular => ({
  startAt: new Date(NOW - DAY).toISOString(),
  endAt: new Date(NOW + 10 * DAY).toISOString(),
  ageReferenceDate: "2026-11-01",
  publishedOn: "2026-10-25",
  ...over,
});

const post = (over: Partial<EligibilityPost> = {}): EligibilityPost => ({
  id: "p1",
  minEducation: "hsc",
  subjects: [],
  experienceYears: 0,
  ageMin: 18,
  ageMax: 30,
  ageRelaxations: [],
  eligibleDistrictIds: null,
  eligibleDivisionIds: null,
  gender: "any",
  manualChecks: ["টাইপিং গতি বাংলায় ২০ শব্দ/মিনিট"],
  ...over,
});

const profile = (over: Partial<EligibilityProfile> = {}): EligibilityProfile => ({
  dateOfBirth: "2000-05-10",
  gender: "female",
  homeDistrictId: "dis_khulna",
  specialCategories: [],
  educations: [{ id: "e1", level: "bachelor", degreeName: "BSS", subject: "Accounting", institution: "KU", board: null, passingYear: 2022, result: "3.5" }],
  experiences: [],
  ...over,
});

const run = (c: EligibilityCircular, p: EligibilityPost, pr: EligibilityProfile) => computeEligibility(c, p, pr, NOW, districtById);
const check = (r: ReturnType<typeof run>, key: string) => r.checks.find((c) => c.key === key)!;

describe("age on the reference date", () => {
  it("exactly the maximum age is eligible; one day over fails", () => {
    // Turns 30 on 2026-11-01 (the reference date) → 30y 0m 0d → pass
    expect(check(run(circular(), post(), profile({ dateOfBirth: "1996-11-01" })), "age").status).toBe("pass");
    // Turned 30 the day before → 30y 0m 1d → fail
    expect(check(run(circular(), post(), profile({ dateOfBirth: "1996-10-31" })), "age").status).toBe("fail");
  });
  it("one day short of the minimum fails; reaching it passes", () => {
    expect(check(run(circular(), post(), profile({ dateOfBirth: "2008-11-02" })), "age").status).toBe("fail");
    expect(check(run(circular(), post(), profile({ dateOfBirth: "2008-11-01" })), "age").status).toBe("pass");
  });
  it("returns the age text in Bangla", () => {
    const r = run(circular({ ageReferenceDate: "2026-11-01" }), post(), profile({ dateOfBirth: "1994-11-03" }));
    expect(r.age).toEqual({ years: 31, months: 11, days: 29, referenceDate: "2026-11-01" });
    expect(check(r, "age").messageBn).toContain("৩১ বছর ১১ মাস ২৯ দিন");
  });
  it("handles a Feb-29 birthday in a non-leap year", () => {
    const r = run(circular({ ageReferenceDate: "2030-02-28" }), post({ ageMax: 30 }), profile({ dateOfBirth: "2000-02-29" }));
    expect(r.age).toMatchObject({ years: 29, months: 11 });
    expect(check(r, "age").status).toBe("pass");
    const r2 = run(circular({ ageReferenceDate: "2030-03-01" }), post({ ageMax: 30 }), profile({ dateOfBirth: "2000-02-29" }));
    expect(r2.age).toMatchObject({ years: 30, months: 0, days: 0 });
  });
  it("falls back to the publish date when the reference date is missing", () => {
    const r = run(circular({ ageReferenceDate: null }), post(), profile());
    expect(r.age?.referenceDate).toBe("2026-10-25");
  });
  it("applies an age relaxation for a matching special category only", () => {
    const p = post({ ageMax: 30, ageRelaxations: [{ categoryBn: "মুক্তিযোদ্ধার সন্তান", extraYears: 2 }] });
    const dob = "1995-06-01"; // 31 on the reference date
    expect(check(run(circular(), p, profile({ dateOfBirth: dob })), "age").status).toBe("fail");
    expect(check(run(circular(), p, profile({ dateOfBirth: dob, specialCategories: ["freedom_fighter_family"] })), "age").status).toBe("pass");
    expect(check(run(circular(), p, profile({ dateOfBirth: dob, specialCategories: ["orphan"] })), "age").status).toBe("fail");
  });
  it("missing date of birth → unknown → needs_info", () => {
    const r = run(circular(), post(), profile({ dateOfBirth: null }));
    expect(check(r, "age").status).toBe("unknown");
    expect(r.verdict).toBe("needs_info");
  });
});

describe("education and subject", () => {
  it("ranks hsc = diploma", () => {
    expect(check(run(circular(), post({ minEducation: "hsc" }), profile({ educations: [{ ...profile().educations[0], level: "diploma" }] })), "education").status).toBe("pass");
    expect(check(run(circular(), post({ minEducation: "diploma" }), profile({ educations: [{ ...profile().educations[0], level: "hsc" }] })), "education").status).toBe("pass");
    expect(highestEducation(["ssc", "masters", "hsc"])).toBe("masters");
  });
  it("lower education fails", () => {
    expect(check(run(circular(), post({ minEducation: "masters" }), profile()), "education").status).toBe("fail");
  });
  it("no education → unknown", () => {
    expect(check(run(circular(), post(), profile({ educations: [] })), "education").status).toBe("unknown");
  });
  it("required subject: match passes, unknown subject is unknown (not fail), other subject fails", () => {
    const p = post({ subjects: ["Accounting", "Finance"] });
    expect(check(run(circular(), p, profile()), "subject").status).toBe("pass");
    expect(check(run(circular(), p, profile({ educations: [{ ...profile().educations[0], subject: "" }] })), "subject").status).toBe("unknown");
    expect(check(run(circular(), p, profile({ educations: [{ ...profile().educations[0], subject: "Physics" }] })), "subject").status).toBe("fail");
  });
});

describe("district, gender, experience, window", () => {
  it("restricted districts use the home district", () => {
    expect(check(run(circular(), post({ eligibleDistrictIds: ["dis_khulna"] }), profile()), "district").status).toBe("pass");
    expect(check(run(circular(), post({ eligibleDistrictIds: ["dis_dhaka"] }), profile()), "district").status).toBe("fail");
    expect(check(run(circular(), post({ eligibleDivisionIds: ["div_khu"] }), profile()), "district").status).toBe("pass");
    expect(check(run(circular(), post({ eligibleDistrictIds: ["dis_dhaka"] }), profile({ homeDistrictId: null })), "district").status).toBe("unknown");
  });
  it("gender restriction", () => {
    expect(check(run(circular(), post({ gender: "male" }), profile()), "gender").status).toBe("fail");
    expect(check(run(circular(), post({ gender: "female" }), profile()), "gender").status).toBe("pass");
    expect(check(run(circular(), post({ gender: "female" }), profile({ gender: null })), "gender").status).toBe("unknown");
  });
  it("experience counts overlapping periods once", () => {
    const years = experienceYears(
      [
        { startDate: "2020-01-01", endDate: "2021-12-31", current: false },
        { startDate: "2021-01-01", endDate: "2022-12-31", current: false },
      ],
      NOW,
    );
    expect(years).toBeGreaterThan(2.99);
    expect(years).toBeLessThan(3.01);
    const p = post({ experienceYears: 4 });
    const pr = profile({ experiences: [
      { id: "x", title: "a", organization: "b", startDate: "2020-01-01", endDate: "2021-12-31", current: false, bullets: [] },
      { id: "y", title: "a", organization: "b", startDate: "2021-01-01", endDate: "2022-12-31", current: false, bullets: [] },
    ] });
    expect(check(run(circular(), p, pr), "experience").status).toBe("fail");
  });
  it("application window messages", () => {
    expect(check(run(circular({ endAt: new Date(NOW - 1).toISOString() }), post(), profile()), "deadline")).toMatchObject({ status: "fail", messageBn: "আবেদনের সময় শেষ" });
    expect(check(run(circular({ startAt: new Date(NOW + DAY).toISOString() }), post(), profile()), "deadline").messageBn).toContain("আবেদন এখনো শুরু হয়নি");
  });
});

describe("verdict", () => {
  it("any fail → not_eligible; else unknown → needs_info; else eligible", () => {
    expect(run(circular(), post(), profile()).verdict).toBe("eligible");
    expect(run(circular(), post({ minEducation: "phd" }), profile({ dateOfBirth: null })).verdict).toBe("not_eligible");
    expect(run(circular(), post(), profile({ dateOfBirth: null })).verdict).toBe("needs_info");
  });
  it("passes manual checks through", () => {
    expect(run(circular(), post(), profile()).manualChecks).toEqual(["টাইপিং গতি বাংলায় ২০ শব্দ/মিনিট"]);
  });
});
