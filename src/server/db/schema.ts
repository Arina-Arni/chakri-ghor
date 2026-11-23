/**
 * Database schema (spec §3). Column names are camelCase here and snake_case in Postgres
 * (`casing: "snake_case"`). Foreign keys to `auth.users`, trigram indexes, triggers and RLS
 * live in the hand-written migration `drizzle/0001_supabase.sql`.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AgeRelaxation, JobFilters, ProfileLink, ResumeChange, ResumeContent } from "@/types";

const id = () => uuid().primaryKey().defaultRandom();
const ts = () => timestamp({ withTimezone: true, mode: "date" });
const createdAt = () => ts().notNull().defaultNow();
const updatedAt = () => ts().notNull().defaultNow();

// ───────── enums ─────────

export const roleEnum = pgEnum("role", ["seeker", "moderator", "admin", "employer"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const genderEnum = pgEnum("gender", ["male", "female", "third_gender"]);
export const educationLevelEnum = pgEnum("education_level", ["class_8", "ssc", "hsc", "diploma", "bachelor", "masters", "phd"]);
export const orgTypeEnum = pgEnum("organization_type", [
  "ministry",
  "directorate",
  "district_office",
  "corporation",
  "bank",
  "autonomous",
  "company",
  "ngo",
]);
export const sectorEnum = pgEnum("sector", ["government", "semi_government", "autonomous", "private", "ngo", "international"]);
export const jobTypeEnum = pgEnum("job_type", ["full_time", "part_time", "contract", "internship"]);
export const workModeEnum = pgEnum("work_mode", ["onsite", "remote", "hybrid"]);
export const applyPlatformEnum = pgEnum("apply_platform", ["teletalk", "official_site", "email", "postal"]);
export const circularStatusEnum = pgEnum("circular_status", [
  "draft",
  "pending_review",
  "published",
  "closed",
  "rejected",
  "cancelled",
  "archived",
]);
export const circularSourceEnum = pgEnum("circular_source", ["manual", "pipeline", "employer"]);
export const genderRuleEnum = pgEnum("gender_rule", ["any", "male", "female"]);
export const tagSourceEnum = pgEnum("tag_source", ["ai", "manual", "rule"]);
export const applicationStatusEnum = pgEnum("application_status", [
  "saved",
  "preparing",
  "applied",
  "admit_card",
  "exam_scheduled",
  "written_passed",
  "viva",
  "selected",
  "rejected",
  "withdrawn",
]);
export const cvJobStatusEnum = pgEnum("cv_job_status", ["processing", "succeeded", "fallback", "failed"]);
export const notificationTypeEnum = pgEnum("notification_type", ["deadline", "new_match", "exam", "application", "system"]);
export const searchModeEnum = pgEnum("search_mode", ["normal", "ai", "ai_fallback"]);
export const idempotencyStatusEnum = pgEnum("idempotency_status", ["in_progress", "completed"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["none", "trialing", "active", "grace", "expired"]);

// ───────── 3.1 reference data ─────────

export const divisions = pgTable("divisions", {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  nameBn: text().notNull(),
  nameEn: text().notNull(),
  aliases: text().array().notNull().default(sql`'{}'::text[]`),
});

export const districts = pgTable(
  "districts",
  {
    id: text().primaryKey(),
    slug: text().notNull().unique(),
    divisionId: text()
      .notNull()
      .references(() => divisions.id, { onDelete: "restrict" }),
    nameBn: text().notNull(),
    nameEn: text().notNull(),
    aliases: text().array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [index().on(t.divisionId)],
);

export const categories = pgTable("categories", {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  nameBn: text().notNull(),
  nameEn: text().notNull(),
  icon: text().notNull().default("briefcase"),
});

export const tags = pgTable("tags", {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  labelBn: text().notNull(),
  labelEn: text().notNull().default(""),
});

// ───────── 3.2 users & seekers ─────────

/** One row per auth user (FK to auth.users added in 0001_supabase.sql). */
export const profiles = pgTable(
  "profiles",
  {
    userId: uuid().primaryKey(),
    role: roleEnum().notNull().default("seeker"),
    status: userStatusEnum().notNull().default("active"),
    fullName: text().notNull().default(""),
    phone: text(),
    dateOfBirth: date({ mode: "string" }),
    gender: genderEnum(),
    homeDistrictId: text().references(() => districts.id, { onDelete: "set null" }),
    currentDistrictId: text().references(() => districts.id, { onDelete: "set null" }),
    specialCategories: text().array().notNull().default(sql`'{}'::text[]`),
    headline: text().notNull().default(""),
    summary: text().notNull().default(""),
    links: jsonb().$type<ProfileLink[]>().notNull().default(sql`'[]'::jsonb`),
    aiFilledFields: text().array().notNull().default(sql`'{}'::text[]`),
    onboardingStep: integer().notNull().default(1),
    onboardingCompletedAt: ts(),
    aiConsentAt: ts(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: integer().notNull().default(1),
  },
  (t) => [index().on(t.role), check("profiles_onboarding_step", sql`${t.onboardingStep} between 1 and 4`)],
);

const owner = () =>
  uuid()
    .notNull()
    .references(() => profiles.userId, { onDelete: "cascade" });

export const educations = pgTable(
  "educations",
  {
    id: id(),
    userId: owner(),
    level: educationLevelEnum().notNull(),
    degreeName: text().notNull(),
    subject: text().notNull().default(""),
    institution: text().notNull(),
    boardOrUniversity: text(),
    resultText: text().notNull().default(""),
    gpa: doublePrecision(),
    passingYear: integer().notNull(),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

export const experiences = pgTable(
  "experiences",
  {
    id: id(),
    userId: owner(),
    title: text().notNull(),
    organization: text().notNull(),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }),
    isCurrent: boolean().notNull().default(false),
    bullets: text().array().notNull().default(sql`'{}'::text[]`),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

export const userSkills = pgTable(
  "user_skills",
  {
    id: id(),
    userId: owner(),
    skill: text().notNull(),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.userId, t.skill)],
);

export const preferences = pgTable("preferences", {
  userId: uuid()
    .primaryKey()
    .references(() => profiles.userId, { onDelete: "cascade" }),
  categoryIds: text().array().notNull().default(sql`'{}'::text[]`),
  districtIds: text().array().notNull().default(sql`'{}'::text[]`),
  sectors: text().array().notNull().default(sql`'{}'::text[]`),
  jobTypes: text().array().notNull().default(sql`'{}'::text[]`),
  workModes: text().array().notNull().default(sql`'{}'::text[]`),
  minSalary: integer(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid()
    .primaryKey()
    .references(() => profiles.userId, { onDelete: "cascade" }),
  emailEnabled: boolean().notNull().default(true),
  deadlineReminders: boolean().notNull().default(true),
  newMatches: boolean().notNull().default(true),
  examReminders: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: integer().notNull().default(1),
});

// ───────── 3.3 organizations & circulars ─────────

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    nameBn: text().notNull(),
    nameEn: text().notNull(),
    shortName: text().notNull(),
    slug: text().notNull(),
    type: orgTypeEnum().notNull(),
    website: text(),
    verified: boolean().notNull().default(false),
    verifiedBy: uuid().references(() => profiles.userId, { onDelete: "set null" }),
    verifiedAt: ts(),
    createdBy: uuid().references(() => profiles.userId, { onDelete: "set null" }),
    isSample: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts(),
    version: integer().notNull().default(1),
  },
  (t) => [uniqueIndex("organizations_slug_unique").on(t.slug)],
);

export const circulars = pgTable(
  "circulars",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    noticeNo: text(),
    titleBn: text().notNull(),
    titleEn: text().notNull().default(""),
    slug: text().notNull(),
    descriptionBn: text().notNull().default(""),
    howToApplyBn: text().array().notNull().default(sql`'{}'::text[]`),
    sector: sectorEnum().notNull(),
    jobType: jobTypeEnum().notNull().default("full_time"),
    workMode: workModeEnum().notNull().default("onsite"),
    categoryId: text()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    divisionId: text().references(() => divisions.id, { onDelete: "set null" }),
    districtId: text().references(() => districts.id, { onDelete: "set null" }),
    publishedOn: date({ mode: "string" }),
    applicationStartAt: ts().notNull(),
    applicationEndAt: ts().notNull(),
    /** Set on the first deadline extension. */
    originalEndAt: ts(),
    ageReferenceDate: date({ mode: "string" }),
    applyUrl: text().notNull(),
    applyPlatform: applyPlatformEnum().notNull(),
    applicationFee: integer(),
    feeText: text(),
    sourceUrl: text(),
    pdfPath: text(),
    pdfSha256: text(),
    status: circularStatusEnum().notNull().default("draft"),
    reviewNote: text(),
    submittedBy: uuid().references(() => profiles.userId, { onDelete: "set null" }),
    reviewedBy: uuid().references(() => profiles.userId, { onDelete: "set null" }),
    publishedAt: ts(),
    closedAt: ts(),
    parentCircularId: uuid(),
    revision: integer().notNull().default(0),
    contentHash: text(),
    confidence: doublePrecision(),
    source: circularSourceEnum().notNull().default("manual"),
    aiTags: text().array().notNull().default(sql`'{}'::text[]`),
    views: integer().notNull().default(0),
    applyClicks: integer().notNull().default(0),
    /** Denormalized for sorting/filtering; maintained by the circular service. */
    totalVacancies: integer().notNull().default(0),
    maxSalary: integer(),
    minSalary: integer(),
    /** Lower-cased titles + organization names + post titles + places; trigram-indexed. */
    searchText: text().notNull().default(""),
    isSample: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts(),
    version: integer().notNull().default(1),
  },
  (t) => [
    uniqueIndex("circulars_slug_unique").on(t.slug),
    uniqueIndex("circulars_org_notice_unique")
      .on(t.organizationId, t.noticeNo)
      .where(sql`${t.noticeNo} is not null and ${t.deletedAt} is null`),
    uniqueIndex("circulars_pdf_sha_unique").on(t.pdfSha256).where(sql`${t.pdfSha256} is not null`),
    index("circulars_status_end_idx").on(t.status, t.applicationEndAt),
    index("circulars_org_idx").on(t.organizationId),
    index("circulars_category_idx").on(t.categoryId),
    check("circulars_end_after_start", sql`${t.applicationEndAt} > ${t.applicationStartAt}`),
  ],
);

export const circularPosts = pgTable(
  "circular_posts",
  {
    id: id(),
    circularId: uuid()
      .notNull()
      .references(() => circulars.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    titleBn: text().notNull(),
    titleEn: text().notNull().default(""),
    vacancies: integer().notNull(),
    grade: text(),
    salaryMin: integer(),
    salaryMax: integer(),
    salaryText: text(),
    minEducationLevel: educationLevelEnum().notNull(),
    requiredSubjects: text().array().notNull().default(sql`'{}'::text[]`),
    experienceYearsMin: integer().notNull().default(0),
    ageMin: integer(),
    ageMax: integer(),
    ageRelaxations: jsonb().$type<AgeRelaxation[]>().notNull().default(sql`'[]'::jsonb`),
    /** Empty = nationwide. */
    eligibleDistrictIds: text().array().notNull().default(sql`'{}'::text[]`),
    eligibleDivisionIds: text().array().notNull().default(sql`'{}'::text[]`),
    genderRestriction: genderRuleEnum().notNull().default("any"),
    otherRequirements: text().array().notNull().default(sql`'{}'::text[]`),
    keywordsEn: text().array().notNull().default(sql`'{}'::text[]`),
    keywordsPreferred: text().array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("circular_posts_circular_idx").on(t.circularId),
    check("circular_posts_vacancies_positive", sql`${t.vacancies} > 0`),
    check("circular_posts_age_range", sql`${t.ageMin} is null or ${t.ageMax} is null or ${t.ageMin} <= ${t.ageMax}`),
    check("circular_posts_salary_range", sql`${t.salaryMin} is null or ${t.salaryMax} is null or ${t.salaryMin} <= ${t.salaryMax}`),
  ],
);

export const circularTags = pgTable(
  "circular_tags",
  {
    id: id(),
    circularId: uuid()
      .notNull()
      .references(() => circulars.id, { onDelete: "cascade" }),
    tagId: text()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    source: tagSourceEnum().notNull().default("manual"),
    confidence: doublePrecision(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.circularId, t.tagId)],
);

export type RevisionSnapshot = { before: Record<string, unknown>; after: Record<string, unknown> };

export const circularRevisions = pgTable(
  "circular_revisions",
  {
    id: id(),
    circularId: uuid()
      .notNull()
      .references(() => circulars.id, { onDelete: "cascade" }),
    snapshot: jsonb().$type<RevisionSnapshot>().notNull(),
    changedFields: text().array().notNull(),
    critical: boolean().notNull().default(false),
    changedBy: uuid().references(() => profiles.userId, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.circularId, t.createdAt)],
);

export const circularReports = pgTable("circular_reports", {
  id: id(),
  circularId: uuid()
    .notNull()
    .references(() => circulars.id, { onDelete: "cascade" }),
  userId: uuid().references(() => profiles.userId, { onDelete: "set null" }),
  message: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Once-per-visitor-per-day counters for views and apply clicks. */
export const circularCounterDedupe = pgTable(
  "circular_counter_dedupe",
  {
    circularId: uuid()
      .notNull()
      .references(() => circulars.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    visitorHash: text().notNull(),
    day: date({ mode: "string" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.circularId, t.kind, t.visitorHash, t.day] })],
);

// ───────── 3.4 seeker activity ─────────

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: id(),
    userId: owner(),
    circularPostId: uuid()
      .notNull()
      .references(() => circularPosts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("bookmarks_user_post_unique").on(t.userId, t.circularPostId), index().on(t.circularPostId)],
);

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: id(),
    userId: owner(),
    name: text().notNull(),
    filters: jsonb().$type<JobFilters>().notNull(),
    alertEnabled: boolean().notNull().default(true),
    lastNotifiedAt: ts(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

export const applications = pgTable(
  "applications",
  {
    id: id(),
    userId: owner(),
    circularPostId: uuid()
      .notNull()
      .references(() => circularPosts.id, { onDelete: "cascade" }),
    status: applicationStatusEnum().notNull().default("saved"),
    /** e.g. Teletalk user ID. Never a password. */
    applicantRef: text(),
    feePaid: boolean().notNull().default(false),
    appliedAt: ts(),
    examAt: ts(),
    examVenue: text(),
    notes: text().notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: integer().notNull().default(1),
  },
  (t) => [
    unique("applications_user_post_unique").on(t.userId, t.circularPostId),
    index("applications_user_status_idx").on(t.userId, t.status),
  ],
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: id(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatusEnum(),
    toStatus: applicationStatusEnum().notNull(),
    actorId: uuid().references(() => profiles.userId, { onDelete: "set null" }),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.applicationId, t.createdAt)],
);

export const resumes = pgTable(
  "resumes",
  {
    id: id(),
    userId: owner(),
    /** null = the base resume. */
    circularPostId: uuid().references(() => circularPosts.id, { onDelete: "set null" }),
    title: text().notNull(),
    content: jsonb().$type<ResumeContent>().notNull(),
    atsScore: integer().notNull().default(0),
    matchedKeywords: text().array().notNull().default(sql`'{}'::text[]`),
    missingKeywords: text().array().notNull().default(sql`'{}'::text[]`),
    aiChanges: jsonb().$type<ResumeChange[]>().notNull().default(sql`'[]'::jsonb`),
    aiSummaryBn: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: integer().notNull().default(1),
  },
  (t) => [
    index().on(t.userId),
    uniqueIndex("resumes_one_base_per_user").on(t.userId).where(sql`${t.circularPostId} is null`),
  ],
);

export const resumeVersions = pgTable(
  "resume_versions",
  {
    id: id(),
    resumeId: uuid()
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    labelBn: text().notNull().default(""),
    content: jsonb().$type<ResumeContent>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.resumeId, t.createdAt)],
);

export const cvParseJobs = pgTable(
  "cv_parse_jobs",
  {
    id: id(),
    userId: owner(),
    fileSha256: text().notNull(),
    mime: text().notNull(),
    sizeBytes: integer().notNull(),
    status: cvJobStatusEnum().notNull().default("processing"),
    result: jsonb(),
    errorCode: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.fileSha256, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: owner(),
    type: notificationTypeEnum().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    link: text(),
    readAt: ts(),
    dedupeKey: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("notifications_dedupe_unique").on(t.dedupeKey), index("notifications_user_read_idx").on(t.userId, t.readAt)],
);

export const subscriptions = pgTable("subscriptions", {
  userId: uuid()
    .primaryKey()
    .references(() => profiles.userId, { onDelete: "cascade" }),
  planId: text().notNull().default("free"),
  status: subscriptionStatusEnum().notNull().default("none"),
  trialEndsAt: ts(),
  currentPeriodEnd: ts(),
  cancelAtPeriodEnd: boolean().notNull().default(false),
  trialUsed: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────── 3.5 operations ─────────

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: id(),
    key: text().notNull(),
    /** Guests share the nil UUID; their keys are still unique per random key. */
    userId: uuid().notNull(),
    action: text().notNull(),
    requestHash: text().notNull(),
    response: jsonb(),
    status: idempotencyStatusEnum().notNull().default("in_progress"),
    createdAt: createdAt(),
  },
  (t) => [unique("idempotency_user_key_unique").on(t.userId, t.key), index().on(t.createdAt)],
);

export const searchLogs = pgTable(
  "search_logs",
  {
    id: id(),
    normalizedQuery: text().notNull(),
    parsedFilters: jsonb().$type<JobFilters>().notNull(),
    mode: searchModeEnum().notNull(),
    resultCount: integer().notNull(),
    userId: uuid().references(() => profiles.userId, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt), index().on(t.normalizedQuery)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid(),
    actorRole: text().notNull(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
    ipHash: text(),
    userAgent: text(),
    requestId: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt), index().on(t.entityType, t.entityId)],
);

/** Fixed-window counters for the auth rate limiter. */
export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  windowStart: ts().notNull(),
  count: integer().notNull().default(0),
});

/** Admin-editable settings (feature flags, plan quotas). Part 3 extends this. */
export const appSettings = pgTable("app_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedBy: uuid().references(() => profiles.userId, { onDelete: "set null" }),
  updatedAt: updatedAt(),
  version: integer().notNull().default(1),
});
