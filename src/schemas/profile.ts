import { z } from "zod";
import { ageOn, dhakaDateKey } from "@/domain/bn";
import { t } from "@/i18n";
import { EDUCATION_LEVELS } from "@/types";
import { dateInput, intInput, optDateInput, optIntInput, optText, optUrl, phoneBd, reqText } from "./common";

const genders = ["male", "female", "third_gender"] as const;
const specialCategories = [
  "freedom_fighter_family",
  "ethnic_minority",
  "disability",
  "orphan",
  "ansar_vdp",
] as const;

export const dateOfBirth = dateInput.superRefine((iso, ctx) => {
  const today = dhakaDateKey(Date.now());
  if (iso > today) ctx.addIssue({ code: "custom", message: t("validation.futureDob") });
  else if (ageOn(iso, today).years < 15) ctx.addIssue({ code: "custom", message: t("validation.minAge") });
});

export const profileStep1Schema = z.object({
  fullName: reqText(80, 2),
  dateOfBirth,
  gender: z.enum(genders, { error: t("validation.required") }),
  phone: phoneBd,
  homeDistrictId: z.string().min(1, { error: t("validation.required") }),
  currentDistrictId: z.string().min(1, { error: t("validation.required") }),
  specialCategories: z.array(z.enum(specialCategories)),
});

export const linkSchema = z.object({ label: reqText(40), url: optUrl });

export const experienceSchema = z
  .object({
    id: z.string(),
    title: reqText(80),
    organization: reqText(120),
    startDate: dateInput,
    endDate: optDateInput,
    current: z.boolean(),
    bulletsText: optText(2000),
  })
  .superRefine((v, ctx) => {
    if (!v.current && !v.endDate) {
      ctx.addIssue({ code: "custom", message: t("validation.required"), path: ["endDate"] });
    }
    if (!v.current && v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", message: t("validation.endAfterStart"), path: ["endDate"] });
    }
  });

export const profileStep2Schema = z.object({
  headline: optText(120),
  summary: optText(1000),
  links: z.array(linkSchema).max(5),
  experiences: z.array(experienceSchema).max(10),
});

const thisYear = new Date().getFullYear();

export const educationSchema = z.object({
  id: z.string(),
  level: z.enum(EDUCATION_LEVELS, { error: t("validation.required") }),
  degreeName: reqText(80),
  subject: optText(80),
  institution: reqText(120),
  board: optText(40),
  passingYear: intInput(1960, thisYear + 1),
  result: optText(30),
});

export const preferencesSchema = z.object({
  categoryIds: z.array(z.string()),
  districtIds: z.array(z.string()),
  sectors: z.array(z.string()),
  jobTypes: z.array(z.string()),
  workModes: z.array(z.string()),
  minSalary: optIntInput(0, 10_000_000),
});

export const profileStep3Schema = z.object({
  educations: z.array(educationSchema).min(1, { error: t("validation.required") }).max(8),
  skills: z.array(z.string().trim().min(1).max(40)).max(40),
  preferences: preferencesSchema,
});

export type ProfileStep1Input = z.input<typeof profileStep1Schema>;
export type ProfileStep1Output = z.output<typeof profileStep1Schema>;
export type ProfileStep2Input = z.input<typeof profileStep2Schema>;
export type ProfileStep2Output = z.output<typeof profileStep2Schema>;
export type ProfileStep3Input = z.input<typeof profileStep3Schema>;
export type ProfileStep3Output = z.output<typeof profileStep3Schema>;
