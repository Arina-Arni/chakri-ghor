import "server-only";
import { t } from "@/i18n";
import type { ApiError, ErrorCode, Result } from "@/types";

/** HTTP status for each error code (spec §6). */
export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNKNOWN: 500,
  NETWORK: 503,
  NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION: 422,
  CONFLICT: 409,
  QUOTA_EXCEEDED: 429,
  RATE_LIMITED: 429,
  ILLEGAL_TRANSITION: 409,
  PROFILE_INCOMPLETE: 422,
  DUPLICATE: 409,
  AI_UNAVAILABLE: 503,
  FILE_TOO_LARGE: 413,
  FILE_TYPE: 415,
  FILE_ENCRYPTED: 422,
  CV_UNREADABLE: 422,
};

/** An expected failure. Services throw it; the API boundary turns it into a Result. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;
  readonly retryAfterSec?: number;
  readonly messageBn: string;

  constructor(code: ErrorCode, opts: { message_bn?: string; fields?: Record<string, string>; retryAfterSec?: number } = {}) {
    super(code);
    this.code = code;
    this.messageBn = opts.message_bn ?? t(`errors.${code}`);
    this.fields = opts.fields;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export const notFound = () => new AppError("NOT_FOUND");
export const forbidden = () => new AppError("FORBIDDEN");
export const unauthenticated = () => new AppError("UNAUTHENTICATED");
export const conflict = () => new AppError("CONFLICT");
export const validation = (fields: Record<string, string>, message_bn?: string) => new AppError("VALIDATION", { fields, message_bn });

/** Friendly messages for unique constraints (never a 500). */
const UNIQUE_MESSAGES: Record<string, string> = {
  bookmarks_user_post_unique: "এটি আগেই সেভ করা আছে",
  applications_user_post_unique: "এই পদ আগেই ট্র্যাকারে আছে",
  circulars_org_notice_unique: "এই প্রতিষ্ঠানের এই বিজ্ঞপ্তি নম্বর আগেই আছে",
  circulars_pdf_sha_unique: "এই PDF আগেই যোগ করা হয়েছে",
  circulars_slug_unique: "এই শিরোনামে আগেই একটি সার্কুলার আছে",
  organizations_slug_unique: "এই নামে আগেই একটি প্রতিষ্ঠান আছে",
  notifications_dedupe_unique: "এই নোটিফিকেশন আগেই পাঠানো হয়েছে",
  resumes_one_base_per_user: "মূল রেজুমে আগেই আছে",
};

type PgLikeError = { code?: string; constraint?: string; constraint_name?: string; message?: string; cause?: unknown };

function pgError(e: unknown): PgLikeError | null {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const c = cur as PgLikeError;
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return c;
    cur = c.cause;
  }
  return null;
}

/** Map any thrown value to an AppError (unknown errors become UNKNOWN). */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const pg = pgError(e);
  if (pg) {
    const constraint = pg.constraint ?? pg.constraint_name ?? (pg.message?.match(/constraint "([^"]+)"/)?.[1] ?? "");
    if (pg.code === "23505") {
      return new AppError("DUPLICATE", { message_bn: UNIQUE_MESSAGES[constraint] ?? "এটি আগেই সেভ করা আছে" });
    }
    if (pg.code === "23514" || pg.code === "22P02" || pg.code === "22007" || pg.code === "22008") {
      return new AppError("VALIDATION");
    }
    if (pg.code === "23503") return new AppError("NOT_FOUND");
    if (pg.code === "40001" || pg.code === "40P01") return new AppError("CONFLICT");
    if (pg.code === "42501") return new AppError("FORBIDDEN");
  }
  return new AppError("UNKNOWN");
}

export function toApiError(e: AppError, requestId: string): ApiError {
  return {
    code: e.code,
    message_bn: e.messageBn,
    requestId,
    ...(e.fields ? { fields: e.fields } : {}),
    ...(e.retryAfterSec != null ? { retryAfterSec: e.retryAfterSec } : {}),
  };
}

export function failure<T>(e: unknown, requestId: string): Result<T> {
  const err = toAppError(e);
  if (err.code === "UNKNOWN") {
    // Server-side log with the request id; the client only sees the id.
    console.error(`[${requestId}]`, e);
  }
  return { ok: false, error: toApiError(err, requestId) };
}
