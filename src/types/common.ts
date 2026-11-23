/** ISO-8601 timestamp in UTC, e.g. "2026-12-17T11:00:00.000Z". Displayed in Asia/Dhaka. */
export type IsoDateTime = string;
/** Calendar date "YYYY-MM-DD" (no time zone). */
export type IsoDate = string;
export type Id = string;

export type ApiError = {
  code: string;
  message_bn: string;
  fields?: Record<string, string>;
  requestId?: string;
  retryAfterSec?: number;
};

/** Every data-layer function resolves to a Result; it never throws for expected failures. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Well-known error codes shared by the UI and the Part 2 backend. */
export type ErrorCode =
  | "UNKNOWN"
  | "NETWORK"
  | "NOT_FOUND"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "ILLEGAL_TRANSITION"
  | "PROFILE_INCOMPLETE"
  | "DUPLICATE"
  | "AI_UNAVAILABLE"
  | "FILE_TOO_LARGE"
  | "FILE_TYPE"
  | "FILE_ENCRYPTED"
  | "CV_UNREADABLE";

export type Page<T> = { items: T[]; nextCursor: string | null; total: number };

/** Base for records that support optimistic concurrency. */
export type Versioned = { version: number; updatedAt: IsoDateTime };
