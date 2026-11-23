import type { Id, IsoDate, IsoDateTime, Versioned } from "./common";
import type { OrganizationSummary } from "./taxonomy";

export type Sector =
  | "government"
  | "semi_government"
  | "autonomous"
  | "private"
  | "ngo"
  | "international";
export type JobType = "full_time" | "part_time" | "contract" | "internship";
export type WorkMode = "onsite" | "remote" | "hybrid";
export type ApplyPlatform = "teletalk" | "official_site" | "email" | "postal";

/** Ordered from lowest to highest; comparisons use this order. */
export const EDUCATION_LEVELS = [
  "below_ssc",
  "ssc",
  "hsc",
  "diploma",
  "bachelor",
  "masters",
  "phd",
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export type Gender = "male" | "female" | "third_gender";
export type GenderRule = "any" | "male" | "female";

/** Moderation status of the circular record. */
export type CircularStatus =
  | "draft"
  | "in_review"
  | "published"
  | "rejected"
  | "cancelled"
  | "archived";

/** What a seeker sees, derived from dates (domain/status). */
export type DisplayStatus = "upcoming" | "open" | "closing_soon" | "closed";

export type AgeRelaxation = { categoryBn: string; extraYears: number };

export type CircularPost = {
  id: Id;
  circularId: Id;
  titleBn: string;
  titleEn: string;
  vacancies: number;
  grade: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  /** Free text when the salary is not a range, e.g. "জাতীয় বেতন স্কেল ২০১৫ অনুযায়ী". */
  salaryText: string | null;
  minEducation: EducationLevel;
  subjects: string[];
  experienceYears: number;
  ageMin: number | null;
  ageMax: number | null;
  ageRelaxations: AgeRelaxation[];
  /** null = every district is eligible. */
  eligibleDistrictIds: Id[] | null;
  eligibleDivisionIds: Id[] | null;
  gender: GenderRule;
  otherRequirements: string[];
  /** Checks the seeker must verify themselves, e.g. typing speed. */
  manualChecks: string[];
  keywordsRequired: string[];
  keywordsPreferred: string[];
};

export type Circular = Versioned & {
  id: Id;
  slug: string;
  organization: OrganizationSummary;
  noticeNo: string;
  titleBn: string;
  titleEn: string;
  descriptionBn: string;
  howToApplyBn: string[];
  sector: Sector;
  jobType: JobType;
  workMode: WorkMode;
  categoryId: Id;
  districtId: Id | null;
  divisionId: Id | null;
  tagSlugs: string[];
  /** Tags suggested by AI (shown with ✦). */
  aiTags: string[];
  applyPlatform: ApplyPlatform;
  applyUrl: string;
  applicationFee: number | null;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  /** Set when the deadline was extended. */
  originalEndAt: IsoDateTime | null;
  ageReferenceDate: IsoDate;
  sourceUrl: string;
  noticePdfUrl: string | null;
  status: CircularStatus;
  posts: CircularPost[];
  totalVacancies: number;
  publishedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

/** Compact row used by lists and cards. */
export type CircularListItem = Pick<
  Circular,
  | "id"
  | "slug"
  | "organization"
  | "titleBn"
  | "sector"
  | "jobType"
  | "workMode"
  | "districtId"
  | "aiTags"
  | "applyPlatform"
  | "startAt"
  | "endAt"
  | "originalEndAt"
  | "publishedAt"
  | "totalVacancies"
  | "categoryId"
> & {
  /** First post id; bookmarks and applications point at posts. */
  primaryPostId: Id;
  postCount: number;
  salaryMin: number | null;
  salaryMax: number | null;
  districtNameBn: string | null;
  bookmarked: boolean;
};

export type DeadlineWithin = "today" | "3d" | "7d";
export type JobSort = "deadline" | "newest" | "salary" | "vacancies" | "relevance";

export type JobFilters = {
  q?: string;
  division?: string[];
  district?: string[];
  sector?: Sector[];
  category?: string[];
  organization?: string[];
  education?: EducationLevel[];
  jobType?: JobType[];
  workMode?: WorkMode[];
  salaryMin?: number;
  salaryMax?: number;
  deadlineWithin?: DeadlineWithin;
  status?: ("open" | "upcoming")[];
  eligibleOnly?: boolean;
  sort?: JobSort;
};

export type FacetKey =
  | "division"
  | "district"
  | "sector"
  | "category"
  | "organization"
  | "education"
  | "jobType"
  | "workMode"
  | "deadlineWithin"
  | "status";

export type FacetOption = { value: string; labelBn: string; count: number };
export type Facets = Record<FacetKey, FacetOption[]> & { total: number };

export type ZeroResultSuggestion = {
  /** Filter key and value to remove. */
  key: keyof JobFilters;
  value: string | null;
  labelBn: string;
  resultCount: number;
};

export type SearchChip = { key: keyof JobFilters; value: string; labelBn: string };

export type ParsedSearch = {
  filters: JobFilters;
  chips: SearchChip[];
  mode: "ai" | "fallback";
  /** 0–1; below 0.6 the UI asks the user to double-check the filters. */
  confidence: number;
};

export type CircularDetail = {
  circular: Circular;
  similar: CircularListItem[];
  /** Posts of this circular the viewer has bookmarked. */
  bookmarkedPostIds: string[];
  /** postId → applicationId for posts already in the viewer's tracker. */
  trackedPosts: Record<string, string>;
};

export type OrganizationDetail = {
  organization: import("./taxonomy").Organization;
  open: CircularListItem[];
  past: CircularListItem[];
};

export type Taxonomy = {
  divisions: import("./taxonomy").Division[];
  districts: import("./taxonomy").District[];
  categories: import("./taxonomy").Category[];
  tags: import("./taxonomy").Tag[];
  organizations: OrganizationSummary[];
};

export type LandingStats = {
  openCirculars: number;
  totalVacancies: number;
  closingToday: number;
  closingTodayJobs: CircularListItem[];
  categories: { id: Id; slug: string; nameBn: string; icon: string; count: number }[];
  divisions: { id: Id; slug: string; nameBn: string; count: number }[];
};
