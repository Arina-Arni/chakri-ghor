import { describe, expect, it } from "vitest";
import { atsLabel, computeAtsScore, hasKeyword, resumeText, translateKeyword } from "@/domain/ats";
import type { ResumeContent } from "@/types";

const full: ResumeContent = {
  contact: {
    fullName: "Rahima Akter",
    email: "rahima@example.com",
    phone: "01712345678",
    location: "Khulna",
    links: [],
  },
  headline: "Office Assistant",
  summary:
    "Detail-oriented office assistant with four years of experience in computer typing, data entry and record keeping for a district office, handling correspondence and filing with accuracy.",
  skills: ["Computer Typing", "Bangla Typing", "MS Office", "Data Entry", "Record Keeping"],
  experience: [
    {
      id: "e1",
      title: "Office Assistant",
      organization: "Upazila Office",
      location: "Khulna",
      startDate: "2022",
      endDate: "Present",
      bullets: ["Typed 40 letters a day in Bangla and English", "Maintained file records"],
    },
  ],
  education: [{ id: "ed1", degree: "HSC", institution: "Khulna College", year: "2020", result: "GPA 4.5" }],
  certifications: [],
  languages: ["Bangla", "English"],
};

describe("keyword matching", () => {
  it("translates Bangla keywords with the dictionary", () => {
    expect(translateKeyword("কম্পিউটার মুদ্রাক্ষরিক")).toBe("Computer Typing");
    expect(translateKeyword("Unknown Skill")).toBe("Unknown Skill");
  });
  it("matches aliases", () => {
    const text = resumeText(full);
    expect(hasKeyword(text, "Microsoft Office")).toBe(true);
    expect(hasKeyword(text, "কম্পিউটার মুদ্রাক্ষরিক")).toBe(true);
    expect(hasKeyword(text, "Accounting")).toBe(false);
  });
  it("matches whole phrases only", () => {
    const text = resumeText({ ...full, skills: ["Javascripting"] });
    expect(hasKeyword(text, "Java")).toBe(false);
  });
});

describe("computeAtsScore", () => {
  it("scores a complete, matching resume as excellent", () => {
    const r = computeAtsScore(full, {
      required: ["কম্পিউটার মুদ্রাক্ষরিক", "Data Entry"],
      preferred: ["Microsoft Office"],
    });
    expect(r.score).toBe(100);
    expect(r.label).toBe("excellent");
    expect(r.matched).toEqual(["Computer Typing", "Data Entry", "Microsoft Office"]);
    expect(r.missing).toEqual([]);
  });

  it("drops by the required weight for missing keywords", () => {
    const r = computeAtsScore(full, {
      required: ["Computer Typing", "Accounting"],
      preferred: [],
    });
    expect(r.breakdown.required).toBe(30);
    expect(r.score).toBe(70);
    expect(r.label).toBe("good");
    expect(r.missing).toEqual(["Accounting"]);
  });

  it("penalizes empty sections and bad format", () => {
    const sparse: ResumeContent = {
      ...full,
      contact: { ...full.contact, email: "not-an-email", phone: "" },
      summary: "",
      skills: [],
      experience: [],
    };
    const r = computeAtsScore(sparse, { required: ["Accounting"], preferred: ["Excel"] });
    expect(r.score).toBeLessThan(20);
    expect(r.label).toBe("needs_work");
  });

  it("is deterministic", () => {
    const kw = { required: ["Data Entry"], preferred: ["Teamwork"] };
    expect(computeAtsScore(full, kw)).toEqual(computeAtsScore(full, kw));
  });

  it("treats no keywords as full coverage", () => {
    expect(computeAtsScore(full, { required: [], preferred: [] }).score).toBe(100);
  });

  it("labels by threshold", () => {
    expect(atsLabel(85)).toBe("excellent");
    expect(atsLabel(84)).toBe("good");
    expect(atsLabel(70)).toBe("good");
    expect(atsLabel(69)).toBe("needs_work");
  });
});
