import { describe, expect, it } from "vitest";
import { factEntities, filtersFromAi, guardResumeChange } from "@/domain/ai-guard";
import { categories, districts, divisions } from "@/domain/taxonomy";

const corpus = `Office Assistant at Upazila Nirbahi Officer's Office, Dumuria. Feb 2023 - Present.
Typed official letters; maintained file records; entered data in Microsoft Excel for 4,000 households. BBS, Accounting, Khulna University.`;

describe("resume hallucination guard", () => {
  it("accepts a rewrite that only rephrases known facts", () => {
    const r = guardResumeChange(
      { before: "Entered survey data", after: "Entered survey data for 4,000 households accurately in Microsoft Excel" },
      corpus,
    );
    expect(r).toEqual({ ok: true, introduced: [] });
  });
  it("rejects an invented employer", () => {
    const r = guardResumeChange({ before: "Typed letters", after: "Typed letters for Grameen Bank Ltd" }, corpus);
    expect(r.ok).toBe(false);
    expect(r.introduced.join(" ")).toMatch(/grameen bank/);
  });
  it("rejects invented numbers, dates, degrees and certifications", () => {
    expect(guardResumeChange({ before: "", after: "Led a team of 12 people" }, corpus).ok).toBe(false);
    expect(guardResumeChange({ before: "", after: "Since March 2019" }, corpus).ok).toBe(false);
    expect(guardResumeChange({ before: "", after: "Holds an MBA" }, corpus).ok).toBe(false);
    expect(guardResumeChange({ before: "", after: "PMP certified project lead" }, corpus).ok).toBe(false);
    expect(guardResumeChange({ before: "", after: "Worked as Senior Accounts Officer" }, corpus).ok).toBe(false);
  });
  it("reads Bangla digits as numbers", () => {
    expect(factEntities("৫ বছরের অভিজ্ঞতা")).toContain("5");
  });
});

describe("AI search output → filters", () => {
  const vocab = {
    districtIds: new Set(districts.map((d) => d.id)),
    divisionIds: new Set(divisions.map((d) => d.id)),
    categoryBySlug: new Map(categories.map((c) => [c.slug, c.id])),
  };
  const base = { keywords: [], district_ids: [], division_ids: [], sector: null, category_slugs: [], job_type: null, work_mode: null, salary_min: null, education_level: null, deadline_within_days: null, confidence: 0.9 };

  it("keeps valid values and maps slugs to ids", () => {
    const r = filtersFromAi({ ...base, district_ids: ["dis_khulna"], sector: "government", category_slugs: ["bank-finance"], salary_min: 30000, deadline_within_days: 2, keywords: ["অফিস সহকারী"] }, vocab);
    expect(r.filters).toEqual({ district: ["dis_khulna"], sector: ["government"], category: ["cat_bank"], salaryMin: 30000, deadlineWithin: "3d", q: "অফিস সহকারী" });
    expect(r.issues).toEqual([]);
  });
  it("drops hallucinated districts, unknown enums and absurd salaries, and lowers confidence", () => {
    const r = filtersFromAi({ ...base, district_ids: ["dis_khulna", "dis_gotham"], sector: "space", salary_min: -5, education_level: "kindergarten", confidence: 0.95 }, vocab);
    expect(r.filters).toEqual({ district: ["dis_khulna"] });
    expect(r.issues).toEqual(expect.arrayContaining(["district:dis_gotham", "sector:space", "salary_min:-5", "education:kindergarten"]));
    expect(r.confidence).toBeLessThanOrEqual(0.6);
  });
});
