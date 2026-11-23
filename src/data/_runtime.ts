// TEMP — replaced by the real implementation in Part 2
import { t } from "@/i18n";
import type { ApiError, ErrorCode, Result } from "@/types";

export const PREVIEW_STATES = ["loading", "empty", "error", "fallback", "quota", "conflict"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

/** True while every data function serves sample data. Part 2 flips this off. */
export const USING_SAMPLE_DATA = true;

/**
 * Dev-only `?__state=` override. `process.env.NODE_ENV` is inlined at build time, so the
 * whole branch is removed from production bundles.
 */
export function forcedState(): PreviewState | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("__state");
  return (PREVIEW_STATES as readonly string[]).includes(value ?? "") ? (value as PreviewState) : null;
}

export function requestId(): string {
  return `REQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: ErrorCode,
  extra: Partial<Omit<ApiError, "code">> = {},
): Result<T> {
  return {
    ok: false,
    error: {
      code,
      message_bn: extra.message_bn ?? t(`errors.${code}`),
      requestId: extra.requestId ?? requestId(),
      ...(extra.fields ? { fields: extra.fields } : {}),
      ...(extra.retryAfterSec != null ? { retryAfterSec: extra.retryAfterSec } : {}),
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function latency(): number {
  return 300 + Math.floor(Math.random() * 500);
}

function randomFailure(): boolean {
  const rate = Number(process.env.NEXT_PUBLIC_FIXTURE_ERROR_RATE ?? 0);
  return rate > 0 && Math.random() < rate;
}

/** Simulate a read: latency, forced loading/empty/error states. */
export async function read<T>(produce: () => Result<T> | T, opts: { empty?: () => T } = {}): Promise<Result<T>> {
  const state = forcedState();
  if (state === "loading") return new Promise<Result<T>>(() => {});
  await sleep(latency());
  if (state === "error" || randomFailure()) return fail("UNKNOWN");
  if (state === "empty" && opts.empty) return ok(opts.empty());
  const value = produce();
  return isResult(value) ? value : ok(value);
}

const idempotency = new Map<string, Result<unknown>>();

/**
 * Simulate a mutation: latency, idempotency (same key → same result, applied once),
 * forced error/conflict states.
 */
export async function mutate<T>(
  key: string,
  apply: () => Result<T> | T,
  opts: { versioned?: boolean } = {},
): Promise<Result<T>> {
  const state = forcedState();
  if (state === "loading") return new Promise<Result<T>>(() => {});
  await sleep(latency());
  const cached = idempotency.get(key);
  if (cached) return cached as Result<T>;
  let result: Result<T>;
  if (state === "error" || randomFailure()) result = fail("UNKNOWN");
  else if (state === "conflict" && opts.versioned) result = fail("CONFLICT");
  else {
    const value = apply();
    result = isResult(value) ? value : ok(value);
  }
  // Failed attempts may be retried with the same key.
  if (result.ok) idempotency.set(key, result);
  return result;
}

/** AI-backed calls: forced fallback / quota states plus slower latency (≤ ~4 s). */
export async function ai<T>(
  produce: (mode: "ai" | "fallback") => Result<T> | T,
  opts: { quota?: () => Result<T> } = {},
): Promise<Result<T>> {
  const state = forcedState();
  if (state === "loading") return new Promise<Result<T>>(() => {});
  await sleep(900 + Math.floor(Math.random() * 1200));
  if (state === "error") return fail("UNKNOWN");
  if (state === "quota") return opts.quota ? opts.quota() : fail("QUOTA_EXCEEDED", { retryAfterSec: 3600 });
  const value = produce(state === "fallback" ? "fallback" : "ai");
  return isResult(value) ? value : ok(value);
}

function isResult<T>(v: unknown): v is Result<T> {
  return typeof v === "object" && v !== null && "ok" in v && typeof (v as { ok: unknown }).ok === "boolean";
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
