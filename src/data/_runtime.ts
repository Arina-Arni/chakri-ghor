import { t } from "@/i18n";
import { notifySessionExpired } from "@/lib/events";
import type { ApiError, ErrorCode, Result } from "@/types";

export const PREVIEW_STATES = ["loading", "empty", "error", "fallback", "quota", "conflict"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

/** Footer notice while the database holds the seeded demo data (set per deployment). */
export const USING_SAMPLE_DATA = process.env.NEXT_PUBLIC_SAMPLE_DATA_NOTICE === "1";

/**
 * Dev-only `?__state=` override for reviewing UI states. `process.env.NODE_ENV` is inlined at
 * build time, so the whole branch is removed from production bundles.
 */
export function forcedState(): PreviewState | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("__state");
  return (PREVIEW_STATES as readonly string[]).includes(value ?? "") ? (value as PreviewState) : null;
}

export function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function fail<T = never>(code: ErrorCode, extra: Partial<Omit<ApiError, "code">> = {}): Result<T> {
  return {
    ok: false,
    error: {
      code,
      message_bn: extra.message_bn ?? t(`errors.${code}`),
      ...(extra.requestId ? { requestId: extra.requestId } : {}),
      ...(extra.fields ? { fields: extra.fields } : {}),
      ...(extra.retryAfterSec != null ? { retryAfterSec: extra.retryAfterSec } : {}),
    },
  };
}

const networkError = <T>(): Result<T> => fail<T>("NETWORK");

/** Signed-in screens that get UNAUTHENTICATED show the "session expired" dialog. */
function watchAuth<T>(r: Result<T>, opts: { signedIn?: boolean }): Result<T> {
  if (!r.ok && r.error.code === "UNAUTHENTICATED" && opts.signedIn !== false) notifySessionExpired();
  return r;
}

/** Call a read endpoint (`POST /api/q/<name>`). Reads run in parallel, unlike Server Actions. */
export async function query<T>(
  name: string,
  args: unknown[] = [],
  opts: { empty?: () => T; ignoreForced?: boolean; signedIn?: boolean } = {},
): Promise<Result<T>> {
  const state = opts.ignoreForced ? null : forcedState();
  if (state === "loading") return new Promise<Result<T>>(() => {});
  if (state === "error") return fail("UNKNOWN");
  if (state === "empty" && opts.empty) return { ok: true, data: opts.empty() };
  try {
    const res = await fetch(`/api/q/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args }),
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = (await res.json().catch(() => null)) as Result<T> | null;
    if (!body || typeof body.ok !== "boolean") return networkError();
    return watchAuth(body, opts);
  } catch {
    return networkError();
  }
}

/** Call a Server Action; network failures and dev preview states become Results. */
export async function mutate<T>(call: () => Promise<Result<T>>, opts: { versioned?: boolean } = {}): Promise<Result<T>> {
  const state = forcedState();
  if (state === "loading") return new Promise<Result<T>>(() => {});
  if (state === "error") return fail("UNKNOWN");
  if (state === "conflict" && opts.versioned) return fail("CONFLICT");
  try {
    return await call();
  } catch {
    return networkError();
  }
}
