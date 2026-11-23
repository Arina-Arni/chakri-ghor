import { z } from "zod";
import { t } from "@/i18n";
import { email, reqText } from "./common";

export const password = z
  .string()
  .min(8, { error: t("validation.passwordWeak") })
  .max(72, { error: t("validation.tooLong", { n: 72 }) })
  .regex(/\d/, { error: t("validation.passwordWeak") })
  .regex(/[^\d\s]/, { error: t("validation.passwordWeak") });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: t("validation.required") }),
});

export const signupSchema = z.object({
  fullName: reqText(80, 2),
  email,
  password,
  terms: z.boolean().refine((v) => v, { error: t("validation.termsRequired") }),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    error: t("validation.passwordMismatch"),
    path: ["confirm"],
  });

/** 0–4, used by the strength meter. */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/\d/.test(pw) && /[a-zA-Zঀ-৿]/.test(pw)) score++;
  if (/[^a-zA-Z0-9ঀ-৿]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}

export type LoginInput = z.input<typeof loginSchema>;
export type SignupInput = z.input<typeof signupSchema>;
