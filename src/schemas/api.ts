/**
 * Server-boundary payload schemas. Forms validate what users type (DD/MM/YYYY, Bangla digits)
 * with the form schemas; the API validates the normalized values the forms produce, using the
 * same building blocks and limits so rules are defined once.
 */
import { z } from "zod";
import { ageOn, dhakaDateKey } from "@/domain/bn";
import { t } from "@/i18n";
import { APPLICATION_STATUSES, EDUCATION_LEVELS } from "@/types";
import { optText, reqText } from "./common";
import { resumeContentSchema } from "./resume";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: t("validation.date") });
const isoDateTime = z.iso.datetime({ offset: true, error: t("validation.date") });
const id = z.string().min(1).max(64);
const uuid = z.uuid({ error: t("errors.NOT_FOUND") });
const BD_PHONE = /^01[3-9]\d{8}$/;
const httpUrl = z.url({ protocol: /^https?$/, error: t("validation.url") });

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_:.-]{8,120}$/);

// ───────── discovery ─────────

const sectors = ["government", "semi_government", "autonomous", "private", "ngo", "international"] as const;
const jobTypes = ["full_time", "part_time", "contract", "internship"] as const;
const workModes = ["onsite", "remote", "hybrid"] as const;

export const jobFiltersSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    division: z.array(id).max(8).optional(),
    district: z.array(id).max(64).optional(),
    sector: z.array(z.enum(sectors)).max(6).optional(),
    category: z.array(id).max(20).optional(),
    organization: z.array(id).max(50).optional(),
    education: z.array(z.enum(EDUCATION_LEVELS)).max(7).optional(),
    jobType: z.array(z.enum(jobTypes)).max(4).optional(),
    workMode: z.array(z.enum(workModes)).max(3).optional(),
    salaryMin: z.number().int().min(0).max(10_000_000).optional(),
    salaryMax: z.number().int().min(0).max(10_000_000).optional(),
    deadlineWithin: z.enum(["today", "3d", "7d"]).optional(),
    status: z.array(z.enum(["open", "upcoming"])).max(2).optional(),
    eligibleOnly: z.boolean().optional(),
    sort: z.enum(["deadline", "newest", "salary", "vacancies", "relevance"]).optional(),
  })
  .strip();

export const cursorSchema = z.string().max(500).nullable();
export const searchTextSchema = z.string().trim().min(1, { error: t("validation.required") }).max(200);

// ───────── profile ─────────

const genders = ["male", "female", "third_gender"] as const;
const specialCategories = ["freedom_fighter_family", "ethnic_minority", "disability", "orphan", "ansar_vdp"] as const;

const dobIso = isoDate.superRefine((iso, ctx) => {
  const today = dhakaDateKey(Date.now());
  if (iso > today) ctx.addIssue({ code: "custom", message: t("validation.futureDob") });
  else if (ageOn(iso, today).years < 15) ctx.addIssue({ code: "custom", message: t("validation.minAge") });
});

export const experiencePayload = z
  .object({
    id: z.string().max(64),
    title: reqText(80),
    organization: reqText(120),
    startDate: isoDate,
    endDate: isoDate.nullable(),
    current: z.boolean(),
    bullets: z.array(z.string().trim().max(300)).max(15),
  })
  .refine((e) => e.current || e.endDate != null, { error: t("validation.required"), path: ["endDate"] })
  .refine((e) => e.current || !e.endDate || e.endDate >= e.startDate, { error: t("validation.endAfterStart"), path: ["endDate"] });

export const educationPayload = z.object({
  id: z.string().max(64),
  level: z.enum(EDUCATION_LEVELS),
  degreeName: reqText(80),
  subject: optText(80),
  institution: reqText(120),
  board: optText(40).nullable(),
  passingYear: z.number().int().min(1960).max(new Date().getFullYear() + 1),
  result: optText(30),
});

export const preferencesPayload = z.object({
  categoryIds: z.array(id).max(20),
  districtIds: z.array(id).max(64),
  sectors: z.array(z.enum(sectors)).max(6),
  jobTypes: z.array(z.enum(jobTypes)).max(4),
  workModes: z.array(z.enum(workModes)).max(3),
  minSalary: z.number().int().min(0).max(10_000_000).nullable(),
});

/**
 * Fields a seeker may change. Anything else (role, status, userId, version, email,
 * completeness…) is stripped — mass-assignment protection.
 */
export const profilePatchSchema = z
  .object({
    fullName: reqText(80, 2),
    dateOfBirth: dobIso.nullable(),
    gender: z.enum(genders).nullable(),
    phone: z
      .union([z.literal(""), z.string().regex(BD_PHONE, { error: t("validation.phone") })])
      .nullable()
      .transform((v) => v || null),
    homeDistrictId: id.nullable(),
    currentDistrictId: id.nullable(),
    specialCategories: z.array(z.enum(specialCategories)).max(5),
    headline: optText(120),
    summary: optText(1000),
    links: z.array(z.object({ label: reqText(40), url: z.union([z.literal(""), httpUrl]) })).max(5),
    experiences: z.array(experiencePayload).max(10),
    educations: z.array(educationPayload).max(8),
    skills: z.array(z.string().trim().min(1).max(40)).max(40),
    preferences: preferencesPayload,
    aiFilledFields: z.array(z.string().max(40)).max(20),
  })
  .partial()
  .strip();

export type ProfilePatch = z.output<typeof profilePatchSchema>;

export const onboardingStepSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

// ───────── seeker activity ─────────

export const savedSearchPayload = z.object({ name: reqText(60, 2), filters: jobFiltersSchema });

export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

export const applicationPatchSchema = z
  .object({
    applicantRef: optText(60).nullable(),
    feePaid: z.boolean(),
    examAt: isoDateTime.nullable(),
    examVenue: optText(200).nullable(),
    notes: optText(2000),
  })
  .partial()
  .strip();

export const statusMovePayload = z.object({
  /** When the user applied (only for moving to `applied` after the deadline). */
  appliedAt: isoDateTime.nullable().optional(),
  examAt: isoDateTime.nullable().optional(),
});

export const notificationSettingsPayload = z
  .object({
    email: z.boolean(),
    deadlineReminders: z.boolean(),
    newMatches: z.boolean(),
    examReminders: z.boolean(),
  })
  .partial()
  .strip();

export const reportPayload = z.object({ message: reqText(1000, 5) });

// ───────── resumes ─────────

export { resumeContentSchema };

// ───────── admin ─────────

const relaxationPayload = z.object({ categoryBn: reqText(60), extraYears: z.number().int().min(1).max(10) });

export const postPayload = z
  .object({
    id: z.string().max(64),
    titleBn: reqText(150),
    titleEn: optText(150),
    vacancies: z.number().int().min(1).max(100_000),
    grade: optText(30).nullable(),
    salaryMin: z.number().int().min(0).max(10_000_000).nullable(),
    salaryMax: z.number().int().min(0).max(10_000_000).nullable(),
    salaryText: optText(120).nullable(),
    minEducation: z.enum(EDUCATION_LEVELS),
    subjects: z.array(z.string().trim().min(1).max(80)).max(20),
    experienceYears: z.number().int().min(0).max(40),
    ageMin: z.number().int().min(14).max(70).nullable(),
    ageMax: z.number().int().min(14).max(70).nullable(),
    ageRelaxations: z.array(relaxationPayload).max(10),
    eligibleDistrictIds: z.array(id).max(64).nullable(),
    eligibleDivisionIds: z.array(id).max(8).nullable(),
    gender: z.enum(["any", "male", "female"]),
    otherRequirements: z.array(reqText(200)).max(20),
    manualChecks: z.array(z.string().max(200)).max(20).optional(),
    keywordsRequired: z.array(z.string().trim().min(1).max(40)).max(30),
    keywordsPreferred: z.array(z.string().trim().min(1).max(40)).max(30),
  })
  .refine((p) => p.ageMin == null || p.ageMax == null || p.ageMin <= p.ageMax, { error: t("validation.ageMinMax"), path: ["ageMax"] })
  .refine((p) => p.salaryMin == null || p.salaryMax == null || p.salaryMin <= p.salaryMax, {
    error: t("validation.salaryMinMax"),
    path: ["salaryMax"],
  });

export const circularPayload = z
  .object({
    id: z.string().max(64).nullable().optional(),
    organizationId: uuid,
    noticeNo: reqText(120),
    titleBn: reqText(200),
    titleEn: optText(200),
    descriptionBn: optText(5000),
    sector: z.enum(sectors),
    jobType: z.enum(jobTypes),
    workMode: z.enum(workModes),
    categoryId: id,
    districtId: id.nullable(),
    divisionId: id.nullable(),
    tagSlugs: z.array(z.string().max(60)).max(20),
    applyPlatform: z.enum(["teletalk", "official_site", "email", "postal"]),
    applyUrl: httpUrl,
    applicationFee: z.number().int().min(0).max(100_000).nullable(),
    startAt: isoDateTime,
    endAt: isoDateTime,
    ageReferenceDate: isoDate,
    sourceUrl: z.union([z.literal(""), httpUrl]),
    posts: z.array(postPayload).min(1, { error: t("validation.required") }).max(50),
  })
  .strip()
  .refine((c) => c.endAt > c.startAt, { error: t("validation.endAfterStart"), path: ["endAt", "date"] })
  .refine((c) => c.ageReferenceDate <= dhakaDateKey(c.endAt), { error: t("validation.ageRefBeforeEnd"), path: ["ageReferenceDate"] });

export type CircularPayload = z.output<typeof circularPayload>;

export const circularActionPayload = z.object({
  reason: z.string().trim().max(500).optional(),
  newEndAt: isoDateTime.optional(),
});

export const organizationPayload = z.object({
  nameBn: reqText(150),
  nameEn: reqText(150),
  shortName: reqText(4, 2).transform((s) => s.toUpperCase()),
  type: z.enum(["ministry", "directorate", "district_office", "corporation", "bank", "autonomous", "company", "ngo"]),
  website: z.union([z.literal(""), httpUrl]).nullable(),
});

export const adminRoleSchema = z.enum(["seeker", "moderator", "admin"]);

export const quotasPayload = z.record(
  z.enum(["free", "premium"]),
  z.object({
    aiSearchPerDay: z.number().int().min(0).max(10_000),
    resumeTailorPerDay: z.number().int().min(0).max(10_000),
    cvParsePerDay: z.number().int().min(0).max(10_000),
  }),
);

export const auditFilterSchema = z
  .object({
    actor: z.string().max(80).optional(),
    action: z.string().max(80).optional(),
    entity: z.string().max(40).optional(),
    from: isoDate.optional().or(z.literal("")),
    to: isoDate.optional().or(z.literal("")),
  })
  .strip();

export { isoDate, isoDateTime, uuid };
