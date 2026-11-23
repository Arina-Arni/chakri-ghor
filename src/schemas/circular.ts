import { z } from "zod";
import { dhakaDateKey } from "@/domain/bn";
import { t } from "@/i18n";
import { EDUCATION_LEVELS } from "@/types";
import {
  dateInput,
  dateTimeInput,
  intInput,
  optIntInput,
  optText,
  optUrl,
  reqText,
  url,
} from "./common";

export const relaxationSchema = z.object({
  categoryBn: reqText(60),
  extraYears: intInput(1, 10),
});

export const postSchema = z
  .object({
    id: z.string(),
    titleBn: reqText(150),
    titleEn: optText(150),
    vacancies: intInput(1, 100_000),
    grade: optText(30),
    salaryMin: optIntInput(0, 10_000_000),
    salaryMax: optIntInput(0, 10_000_000),
    salaryText: optText(120),
    minEducation: z.enum(EDUCATION_LEVELS, { error: t("validation.required") }),
    subjectsText: optText(300),
    experienceYears: intInput(0, 40),
    ageMin: optIntInput(14, 70),
    ageMax: optIntInput(14, 70),
    ageRelaxations: z.array(relaxationSchema).max(10),
    eligibleDistrictIds: z.array(z.string()),
    eligibleDivisionIds: z.array(z.string()),
    gender: z.enum(["any", "male", "female"]),
    otherRequirements: z.array(z.object({ value: reqText(200) })).max(20),
    keywordsRequired: z.array(z.string().trim().min(1).max(40)).max(30),
    keywordsPreferred: z.array(z.string().trim().min(1).max(40)).max(30),
  })
  .superRefine((p, ctx) => {
    if (p.ageMin != null && p.ageMax != null && p.ageMin > p.ageMax) {
      ctx.addIssue({ code: "custom", message: t("validation.ageMinMax"), path: ["ageMax"] });
    }
    if (p.salaryMin != null && p.salaryMax != null && p.salaryMin > p.salaryMax) {
      ctx.addIssue({ code: "custom", message: t("validation.salaryMinMax"), path: ["salaryMax"] });
    }
  });

export const circularSchema = z
  .object({
    organizationId: z.string().min(1, { error: t("validation.required") }),
    noticeNo: reqText(120),
    titleBn: reqText(200),
    titleEn: optText(200),
    descriptionBn: optText(5000),
    sector: z.enum(["government", "semi_government", "autonomous", "private", "ngo", "international"]),
    jobType: z.enum(["full_time", "part_time", "contract", "internship"]),
    workMode: z.enum(["onsite", "remote", "hybrid"]),
    startAt: dateTimeInput,
    endAt: dateTimeInput,
    ageReferenceDate: dateInput,
    applyUrl: url,
    applyPlatform: z.enum(["teletalk", "official_site", "email", "postal"]),
    applicationFee: optIntInput(0, 100_000),
    sourceUrl: optUrl,
    posts: z.array(postSchema).min(1, { error: t("validation.required") }).max(50),
    categoryId: z.string().min(1, { error: t("validation.required") }),
    tagSlugs: z.array(z.string()),
    divisionId: z.string(),
    districtId: z.string(),
  })
  .superRefine((c, ctx) => {
    if (c.endAt <= c.startAt) {
      ctx.addIssue({ code: "custom", message: t("validation.endAfterStart"), path: ["endAt", "date"] });
    }
    if (c.ageReferenceDate > dhakaDateKey(c.endAt)) {
      ctx.addIssue({ code: "custom", message: t("validation.ageRefBeforeEnd"), path: ["ageReferenceDate"] });
    }
  });

/** "সময় বাড়ান": the new end must be later than the current one. */
export const extendDeadlineSchema = (currentEndIso: string) =>
  z.object({ newEnd: dateTimeInput }).superRefine((v, ctx) => {
    if (v.newEnd <= currentEndIso) {
      ctx.addIssue({ code: "custom", message: t("validation.newDateLater"), path: ["newEnd", "date"] });
    }
  });

export const reasonSchema = z.object({ reason: reqText(500, 5) });

export const organizationSchema = z.object({
  nameBn: reqText(150),
  nameEn: reqText(150),
  shortName: reqText(4, 2).transform((s) => s.toUpperCase()),
  type: z.enum([
    "ministry",
    "directorate",
    "district_office",
    "corporation",
    "bank",
    "autonomous",
    "company",
    "ngo",
  ]),
  website: optUrl,
});

export type CircularFormInput = z.input<typeof circularSchema>;
export type CircularFormOutput = z.output<typeof circularSchema>;
export type PostFormInput = z.input<typeof postSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;
