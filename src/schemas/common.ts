import { z } from "zod";
import { dhakaToUtc, parseDateInput, parseNumberInput, parseTimeInput, toEnDigits } from "@/domain/bn";
import { t } from "@/i18n";

/** Required trimmed text with length limits. */
export const reqText = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(1, { error: t("validation.required") })
    .min(min, { error: t("validation.tooShort", { n: min }) })
    .max(max, { error: t("validation.tooLong", { n: max }) });

/** Optional trimmed text ("" allowed). */
export const optText = (max: number) =>
  z.string().trim().max(max, { error: t("validation.tooLong", { n: max }) });

export const email = z
  .string()
  .trim()
  .min(1, { error: t("validation.required") })
  .pipe(z.email({ error: t("validation.email") }));

const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;

/** Bangladesh mobile: 01[3-9]XXXXXXXX, also +880… and Bangla digits. Output: 01XXXXXXXXX. */
export const phoneBd = z
  .string()
  .transform((s) => toEnDigits(s).replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .min(1, { error: t("validation.required") })
      .regex(BD_PHONE, { error: t("validation.phone") }),
  )
  .transform((s) => s.replace(/^\+?88/, ""));

export const optPhoneBd = z
  .string()
  .transform((s) => toEnDigits(s).replace(/[\s-]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(BD_PHONE, { error: t("validation.phone") })]))
  .transform((s) => s.replace(/^\+?88/, ""));

export const url = z
  .string()
  .trim()
  .min(1, { error: t("validation.required") })
  .pipe(z.url({ protocol: /^https?$/, error: t("validation.url") }));

export const optUrl = z
  .string()
  .trim()
  .pipe(z.union([z.literal(""), z.url({ protocol: /^https?$/, error: t("validation.url") })]));

/** Calendar date typed as DD/MM/YYYY (either digit set). Output: "YYYY-MM-DD". */
export const dateInput = z.string().transform((s, ctx) => {
  if (!s.trim()) {
    ctx.addIssue({ code: "custom", message: t("validation.required") });
    return z.NEVER;
  }
  const r = parseDateInput(s);
  if ("error" in r) {
    ctx.addIssue({
      code: "custom",
      message: t(r.error === "impossible" ? "validation.impossibleDate" : "validation.date"),
    });
    return z.NEVER;
  }
  return r.iso;
});

export const optDateInput = z.string().transform((s, ctx) => {
  if (!s.trim()) return null;
  const r = parseDateInput(s);
  if ("error" in r) {
    ctx.addIssue({
      code: "custom",
      message: t(r.error === "impossible" ? "validation.impossibleDate" : "validation.date"),
    });
    return z.NEVER;
  }
  return r.iso;
});

/** Date + time in Asia/Dhaka. Output: UTC ISO string. */
export const dateTimeInput = z
  .object({ date: z.string(), time: z.string() })
  .transform((v, ctx) => {
    if (!v.date.trim()) {
      ctx.addIssue({ code: "custom", message: t("validation.required"), path: ["date"] });
      return z.NEVER;
    }
    const d = parseDateInput(v.date);
    if ("error" in d) {
      ctx.addIssue({
        code: "custom",
        message: t(d.error === "impossible" ? "validation.impossibleDate" : "validation.date"),
        path: ["date"],
      });
      return z.NEVER;
    }
    const time = v.time.trim() ? parseTimeInput(v.time) : "00:00";
    if (!time) {
      ctx.addIssue({ code: "custom", message: t("validation.date"), path: ["time"] });
      return z.NEVER;
    }
    return dhakaToUtc(d.iso, time).toISOString();
  });

export const optDateTimeInput = z
  .object({ date: z.string(), time: z.string() })
  .transform((v, ctx) => {
    if (!v.date.trim()) return null;
    const d = parseDateInput(v.date);
    const time = v.time.trim() ? parseTimeInput(v.time) : "00:00";
    if ("error" in d || !time) {
      ctx.addIssue({ code: "custom", message: t("validation.date"), path: ["date"] });
      return z.NEVER;
    }
    return dhakaToUtc(d.iso, time).toISOString();
  });

/** Integer typed with either digit set. */
export const intInput = (min: number, max: number) =>
  z.string().transform((s, ctx) => {
    if (!s.trim()) {
      ctx.addIssue({ code: "custom", message: t("validation.required") });
      return z.NEVER;
    }
    const n = parseNumberInput(s);
    if (n == null || !Number.isInteger(n)) {
      ctx.addIssue({ code: "custom", message: t("validation.number") });
      return z.NEVER;
    }
    if (n < min) {
      ctx.addIssue({ code: "custom", message: t("validation.min", { n: min }) });
      return z.NEVER;
    }
    if (n > max) {
      ctx.addIssue({ code: "custom", message: t("validation.max", { n: max }) });
      return z.NEVER;
    }
    return n;
  });

/** Optional integer ("" → null). */
export const optIntInput = (min: number, max: number) =>
  z.string().transform((s, ctx) => {
    if (!s.trim()) return null;
    const n = parseNumberInput(s);
    if (n == null || !Number.isInteger(n)) {
      ctx.addIssue({ code: "custom", message: t("validation.number") });
      return z.NEVER;
    }
    if (n < min || n > max) {
      ctx.addIssue({
        code: "custom",
        message: t(n < min ? "validation.min" : "validation.max", { n: n < min ? min : max }),
      });
      return z.NEVER;
    }
    return n;
  });

export type FileRule = { types: string[]; extensions: string[]; maxMb: number };

export const CV_FILE: FileRule = {
  types: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ],
  extensions: ["pdf", "docx", "txt"],
  maxMb: 5,
};

export const CIRCULAR_FILE: FileRule = {
  types: ["application/pdf"],
  extensions: ["pdf"],
  maxMb: 15,
};

/** Check a file's type and size. Returns a Bangla error message or null. */
export function validateFile(file: Pick<File, "name" | "type" | "size">, rule: FileRule): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!rule.types.includes(file.type) && !rule.extensions.includes(ext)) {
    return t("validation.fileType", { types: rule.extensions.map((e) => e.toUpperCase()).join(", ") });
  }
  if (file.size > rule.maxMb * 1024 * 1024) return t("validation.fileSize", { mb: rule.maxMb });
  return null;
}
