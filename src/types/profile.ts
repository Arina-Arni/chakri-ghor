import type { EducationLevel, Gender, JobType, Sector, WorkMode } from "./circular";
import type { Id, IsoDate, IsoDateTime, Versioned } from "./common";

export type Role = "guest" | "seeker" | "moderator" | "admin";

export type Me = {
  id: Id;
  role: Role;
  fullName: string;
  email: string;
  initials: string;
  onboardingStep: OnboardingStep;
  onboardingCompleted: boolean;
  profileCompleteness: number;
  planId: PlanId;
  unreadNotifications: number;
};

export type PlanId = "free" | "premium";

export type OnboardingStep = 1 | 2 | 3 | 4;

export type SpecialCategory =
  | "freedom_fighter_family"
  | "ethnic_minority"
  | "disability"
  | "orphan"
  | "ansar_vdp";

export type Education = {
  id: Id;
  level: EducationLevel;
  degreeName: string;
  subject: string;
  institution: string;
  board: string | null;
  passingYear: number;
  result: string;
};

export type Experience = {
  id: Id;
  title: string;
  organization: string;
  startDate: IsoDate;
  endDate: IsoDate | null;
  current: boolean;
  bullets: string[];
};

export type Preferences = {
  categoryIds: Id[];
  districtIds: Id[];
  sectors: Sector[];
  jobTypes: JobType[];
  workModes: WorkMode[];
  minSalary: number | null;
};

export type ProfileLink = { label: string; url: string };

export type Profile = Versioned & {
  userId: Id;
  fullName: string;
  dateOfBirth: IsoDate | null;
  gender: Gender | null;
  phone: string | null;
  email: string;
  homeDistrictId: Id | null;
  currentDistrictId: Id | null;
  specialCategories: SpecialCategory[];
  headline: string;
  summary: string;
  links: ProfileLink[];
  experiences: Experience[];
  educations: Education[];
  skills: string[];
  preferences: Preferences;
  /** Field names filled by AI from the CV and not yet confirmed by the user. */
  aiFilledFields: string[];
  onboardingStep: OnboardingStep;
  onboardingCompleted: boolean;
  completeness: number;
  /** Bangla labels of missing items, e.g. "জন্ম তারিখ". */
  missingItems: string[];
};

export type CvParseResult = {
  status: "parsed" | "partial";
  /** Fields that were extracted; on "partial" only contact details may be present. */
  extracted: Partial<
    Pick<Profile, "fullName" | "phone" | "email" | "headline" | "summary" | "links" | "skills">
  > & { experiences?: Experience[]; educations?: Education[] };
  aiFilledFields: string[];
};

export type EligibilityCheckKey =
  | "age"
  | "education"
  | "subject"
  | "district"
  | "gender"
  | "experience"
  | "deadline";

export type EligibilityCheck = {
  key: EligibilityCheckKey;
  status: "pass" | "fail" | "unknown";
  messageBn: string;
};

export type EligibilityResult = {
  postId: Id;
  verdict: "eligible" | "not_eligible" | "needs_info";
  checks: EligibilityCheck[];
  age: { years: number; months: number; days: number; referenceDate: IsoDate } | null;
  manualChecks: string[];
  computedAt: IsoDateTime;
};
