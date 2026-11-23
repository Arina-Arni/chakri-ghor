import { describe, expect, it } from "vitest";
import { matchScore } from "@/domain/matching";
import { normalizeQuery, parseQueryRules } from "@/domain/search-parser";
import { categories, districts, divisions } from "@/domain/taxonomy";

const tax = { districts, divisions, categories };
const parse = (q: string) => parseQueryRules(q, tax);

describe("rule-based search parser", () => {
  it("finds a district by Bangla name with a suffix", () => {
    const r = parse("খুলনায় চাকরি");
    expect(r.filters.district).toEqual(["dis_khulna"]);
  });
  it("finds Banglish district aliases", () => {
    expect(parse("kustia job").filters.district).toEqual(["dis_kushtia"]);
    expect(parse("comilla bank").filters.district).toEqual(["dis_cumilla"]);
  });
  it("detects sector words", () => {
    expect(parse("সরকারি চাকরি").filters.sector).toEqual(["government"]);
    expect(parse("sarkari job dhaka").filters.sector).toEqual(["government"]);
    expect(parse("বেসরকারি ব্যাংক").filters.sector).toEqual(["private"]);
  });
  it("detects category and education", () => {
    const r = parse("এইচএসসি পাসে ব্যাংক জব");
    expect(r.filters.education).toEqual(["hsc"]);
    expect(r.filters.category).toEqual(["cat_bank"]);
  });
  it("parses salary in Bangla and English digits", () => {
    expect(parse("৫০ হাজার+ বেতনের চাকরি").filters.salaryMin).toBe(50_000);
    expect(parse("50k remote developer").filters).toMatchObject({ salaryMin: 50_000, workMode: ["remote"], category: ["cat_it"] });
  });
  it("keeps leftover words as the text query", () => {
    const r = parse("খুলনা অফিস সহকারী টাইপিস্ট");
    expect(r.filters.district).toEqual(["dis_khulna"]);
    expect(r.filters.q).toContain("টাইপিস্ট");
  });
  it("gives low confidence when nothing is recognised", () => {
    expect(parse("xyz").confidence).toBeLessThan(0.6);
    expect(parse("ঢাকায় সরকারি এসএসসি").confidence).toBeGreaterThanOrEqual(0.6);
  });
  it("normalizes queries for logs", () => {
    expect(normalizeQuery("  Bank   JOB ৫০  ")).toBe("bank job 50");
  });
});

describe("recommendation score", () => {
  const now = Date.parse("2026-11-23T06:00:00Z");
  const base = { circularDistrictIds: ["dis_khulna"], categoryId: "cat_admin", keywords: ["MS Office", "Data Entry"], endAt: new Date(now + 5 * 86_400_000).toISOString() };
  const profile = { homeDistrictId: "dis_khulna", preferredDistrictIds: [], preferredCategoryIds: ["cat_admin"], skills: ["MS Office", "Data Entry"] };

  it("adds every component up to 100", () => {
    const r = matchScore({ ...base, eligible: true }, profile, now);
    expect(r.score).toBe(40 + 20 + 20 + 15 + 5);
    expect(r.reasonsBn[0]).toBe("আপনি যোগ্য");
  });
  it("is deterministic and drops parts that do not apply", () => {
    const r = matchScore({ ...base, eligible: false, endAt: new Date(now + 3_600_000).toISOString() }, { ...profile, homeDistrictId: null, preferredDistrictIds: [], skills: ["MS Office"] }, now);
    expect(r.score).toBe(20 + 8);
    expect(matchScore({ ...base, eligible: false }, profile, now)).toEqual(matchScore({ ...base, eligible: false }, profile, now));
  });
  it("preferred district counts when the home district does not match", () => {
    const r = matchScore({ ...base, eligible: false }, { ...profile, homeDistrictId: "dis_dhaka", preferredDistrictIds: ["dis_khulna"] }, now);
    expect(r.reasonsBn).toContain("পছন্দের জেলা");
  });
});
