import type { Id, IsoDateTime, Versioned } from "./common";

export type ResumeExperience = {
  id: Id;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
};

export type ResumeEducation = {
  id: Id;
  degree: string;
  institution: string;
  year: string;
  result: string;
};

/** English, single-column ATS resume. */
export type ResumeContent = {
  contact: { fullName: string; email: string; phone: string; location: string; links: string[] };
  headline: string;
  summary: string;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  certifications: string[];
  languages: string[];
};

export type ResumeChange = {
  id: Id;
  section: "summary" | "skills" | "experience" | "headline";
  /** Dotted path into ResumeContent, e.g. "experience.0.bullets.1". */
  path: string;
  before: string;
  after: string;
  reasonBn: string;
  status: "pending" | "accepted" | "rejected";
};

export type ResumeVersion = {
  id: Id;
  resumeId: Id;
  version: number;
  labelBn: string;
  createdAt: IsoDateTime;
  content: ResumeContent;
};

export type Resume = Versioned & {
  id: Id;
  kind: "base" | "tailored";
  title: string;
  circularId: Id | null;
  circularSlug: string | null;
  postId: Id | null;
  jobTitleBn: string | null;
  content: ResumeContent;
  keywordsRequired: string[];
  keywordsPreferred: string[];
  atsScore: number;
  changes: ResumeChange[];
  aiSummaryBn: string | null;
  versions: ResumeVersion[];
};

export type ResumeListItem = Pick<
  Resume,
  "id" | "kind" | "title" | "jobTitleBn" | "atsScore" | "updatedAt" | "circularSlug"
>;

export type AtsLabel = "excellent" | "good" | "needs_work";

export type AtsResult = {
  score: number;
  label: AtsLabel;
  matched: string[];
  missing: string[];
  breakdown: { required: number; preferred: number; sections: number; format: number };
};

export type TailorResult = {
  resume: Resume;
  mode: "ai" | "fallback";
};
