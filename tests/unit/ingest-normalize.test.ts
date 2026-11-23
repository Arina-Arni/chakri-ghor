import { describe, expect, it } from "vitest";
import { districtIdFor, heuristicExtraction, normalizeExtraction, parseDateLoose, parseDateTimeLoose, type Extraction } from "@/domain/ingest";
import { districts } from "@/domain/taxonomy";

const NOW = Date.parse("2026-11-23T06:00:00Z");

const base: Extraction = {
  organization_bn: "জেলা প্রশাসকের কার্যালয়, খুলনা",
  organization_en: "DC Office Khulna",
  notice_no: "০৫.৪৪.৪৭০০.০০৯",
  title_bn: "অফিস সহকারী নিয়োগ",
  title_en: "Office Assistant",
  published_on: "২০ নভেম্বর ২০২৬",
  application_start_at: "২৫/১১/২০২৬",
  application_end_at: "১৫ ডিসেম্বর ২০২৬ বিকাল ৫টা",
  age_reference_date: "01/12/2026",
  apply_url: "https://dck.teletalk.com.bd",
  apply_platform: null,
  fee_text: "১১২ টাকা",
  posts: [{ title_bn: "অফিস সহকারী", vacancies: "১২", salary_min: "৯৩০০", salary_max: 22490, min_education: "এইচএসসি", age_min: 18, age_max: 32, eligible_districts: ["খুলনা", "Bagerhat", "kustia"], gender: "যেকোনো" }],
  overall_confidence: 0.92,
};

describe("dates in Bangla and English", () => {
  it("parses digits, month names and orders", () => {
    expect(parseDateLoose("১৫ ডিসেম্বর ২০২৬")).toBe("2026-12-15");
    expect(parseDateLoose("15 Dec 2026")).toBe("2026-12-15");
    expect(parseDateLoose("১৫/১২/২০২৬")).toBe("2026-12-15");
    expect(parseDateLoose("2026-02-30")).toBeNull();
  });
  it("reads a Bangla afternoon time in Asia/Dhaka", () => {
    expect(parseDateTimeLoose("১৫ ডিসেম্বর ২০২৬ বিকাল ৫টা", "10:00")).toBe("2026-12-15T11:00:00.000Z");
    expect(parseDateTimeLoose("15/12/2026", "17:00")).toBe("2026-12-15T11:00:00.000Z");
  });
});

describe("normalizeExtraction", () => {
  it("normalizes a good extraction without flags", () => {
    const { value, flags } = normalizeExtraction(base, districts, NOW);
    expect(flags).toEqual([]);
    expect(value).toMatchObject({ applyPlatform: "teletalk", applicationFee: 112, publishedOn: "2026-11-20", confidence: 0.92 });
    expect(value.posts[0]).toMatchObject({ vacancies: 12, salaryMin: 9300, minEducation: "hsc", eligibleDistrictIds: ["dis_khulna", "dis_bagerhat", "dis_kushtia"], gender: "any" });
  });
  it("drops invalid fields with flags and lowers confidence", () => {
    const { value, flags } = normalizeExtraction({ ...base, application_start_at: "2027-01-01", posts: [{ ...base.posts[0], salary_min: 900000000, age_min: 40, age_max: 20, eligible_districts: ["Atlantis"] }] }, districts, NOW);
    expect(flags.map((f) => f.field)).toEqual(expect.arrayContaining(["application_start_at", "posts.0.salary", "posts.0.age", "posts.0.eligible_districts"]));
    expect(value.startAt).toBeNull();
    expect(value.posts[0]).toMatchObject({ salaryMin: null, ageMin: null });
    expect(value.confidence).toBeLessThanOrEqual(0.7);
  });
  it("marks missing deadline, title or posts as critical", () => {
    const { flags, value } = normalizeExtraction({ ...base, application_end_at: "শীঘ্রই", posts: [{ title_bn: "x", vacancies: 0 }] }, districts, NOW);
    expect(flags.filter((f) => f.critical).map((f) => f.field).sort()).toEqual(["application_end_at", "posts"]);
    expect(value.confidence).toBe(0);
  });
  it("maps district aliases", () => {
    expect(districtIdFor("কুমিল্লা জেলা", districts)).toBe("dis_cumilla");
    expect(districtIdFor("Comilla", districts)).toBe("dis_cumilla");
  });
});

describe("heuristic fallback", () => {
  it("pulls notice number, deadline and URL from text", () => {
    const x = heuristicExtraction("জেলা প্রশাসকের কার্যালয়, খুলনা\nনিয়োগ বিজ্ঞপ্তি\nস্মারক নং: ০৫.৪৪.৪৭০০\nআবেদনের শেষ তারিখ: ১৫/১২/২০২৬\nhttp://dck.teletalk.com.bd");
    expect(x).toMatchObject({ notice_no: "05.44.4700", application_end_at: "15/12/2026", apply_url: "http://dck.teletalk.com.bd", apply_platform: "teletalk", overall_confidence: 0 });
  });
});
