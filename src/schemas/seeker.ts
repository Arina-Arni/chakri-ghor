import { z } from "zod";
import { t } from "@/i18n";
import { optDateTimeInput, optText, reqText } from "./common";
import { password } from "./auth";
import { email } from "./common";

export const applicationUpdateSchema = z.object({
  applicantRef: optText(60),
  feePaid: z.boolean(),
  examAt: optDateTimeInput,
  examVenue: optText(200),
  notes: optText(2000),
});

export const savedSearchSchema = z.object({ name: reqText(60, 2) });

export const notificationSettingsSchema = z.object({
  email: z.boolean(),
  deadlineReminders: z.boolean(),
  newMatches: z.boolean(),
  examReminders: z.boolean(),
});

export const changeEmailSchema = z.object({
  newEmail: email,
  currentPassword: z.string().min(1, { error: t("validation.required") }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: t("validation.required") }),
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    error: t("validation.passwordMismatch"),
    path: ["confirm"],
  });

export const deleteAccountSchema = z.object({
  confirmation: z.string().refine((v) => v.trim() === t("settings.deleteConfirmWord"), {
    error: t("validation.confirmText", { word: t("settings.deleteConfirmWord") }),
  }),
  currentPassword: z.string().min(1, { error: t("validation.required") }),
});

export const reportErrorSchema = z.object({ message: reqText(1000, 5) });

export type ApplicationUpdateInput = z.input<typeof applicationUpdateSchema>;
