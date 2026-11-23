import "server-only";
import type { z } from "zod";
import { AppError } from "@/server/errors";

/** Parse with a shared Zod schema; failures become VALIDATION with Bangla field messages. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    fields[key] ??= issue.message;
  }
  throw new AppError("VALIDATION", { fields });
}
