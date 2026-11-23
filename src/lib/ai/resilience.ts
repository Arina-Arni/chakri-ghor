/** Pure fault-tolerance helpers (spec Part 3 §2.2–2.5). */
import type { BreakerRecord } from "./types";

export const BACKOFF_BASE_MS = 300;
export const BACKOFF_CAP_MS = 4000;

/** Exponential backoff with full jitter: random in [0, min(cap, base·2^attempt)). */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

export type AiErrorKind = "timeout" | "rate_limited" | "provider_error" | "network" | "bad_request";

/** A failed provider call, classified for the retry policy. */
export class AiCallError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

/** Retry only timeouts, network errors, 429 and 5xx — never 400/401/403. */
export function isRetryable(e: unknown): boolean {
  if (!(e instanceof AiCallError)) return false;
  return e.kind === "timeout" || e.kind === "network" || e.kind === "rate_limited" || (e.kind === "provider_error" && (e.status ?? 500) >= 500);
}

/** `Retry-After` as seconds or an HTTP date → milliseconds. */
export function parseRetryAfter(value: string | null | undefined, now: number): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

/** Delay before the next attempt: Retry-After wins over jitter when present. */
export function nextDelay(e: unknown, attempt: number, random: () => number = Math.random): number {
  const ra = e instanceof AiCallError ? e.retryAfterMs : undefined;
  return ra != null ? ra : backoffMs(attempt, random);
}

/** Deadline propagation: only start a retry that can still finish inside the budget. */
export function canStartAttempt(now: number, deadline: number, delayMs: number, minAttemptMs: number): boolean {
  return now + delayMs + minAttemptMs <= deadline;
}

// ───────── JSON from model text ─────────

export class MalformedJsonError extends Error {}

/** Strip code fences and return the first JSON object in the text. */
export function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("{");
  if (start < 0) throw new MalformedJsonError("no JSON object in response");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(unfenced.slice(start, i + 1));
        } catch (e) {
          throw new MalformedJsonError((e as Error).message);
        }
      }
    }
  }
  throw new MalformedJsonError("unterminated JSON object");
}

// ───────── circuit breaker (pure transitions) ─────────

export const BREAKER_THRESHOLD = 5;
export const BREAKER_WINDOW_MS = 60_000;
export const BREAKER_OPEN_MS = 30_000;

export const CLOSED: BreakerRecord = { state: "closed", failureCount: 0, windowStartedAt: null, openedAt: null };

/**
 * Should a call go through? Open → reject until 30 s pass, then exactly one caller becomes the
 * half-open probe (the store applies this atomically). Half-open with a probe in flight → reject.
 */
export function breakerDecision(b: BreakerRecord, now: number): { decision: "allow" | "probe" | "reject"; next: BreakerRecord } {
  if (b.state === "closed") return { decision: "allow", next: b };
  if (b.state === "open") {
    if (b.openedAt != null && now - b.openedAt >= BREAKER_OPEN_MS) return { decision: "probe", next: { ...b, state: "half_open" } };
    return { decision: "reject", next: b };
  }
  return { decision: "reject", next: b };
}

export function breakerOnSuccess(): BreakerRecord {
  return CLOSED;
}

/** 5 failures inside a 60 s window open the breaker; a failed half-open probe re-opens it. */
export function breakerOnFailure(b: BreakerRecord, now: number): BreakerRecord {
  if (b.state === "half_open") return { state: "open", failureCount: b.failureCount + 1, windowStartedAt: b.windowStartedAt, openedAt: now };
  const fresh = b.windowStartedAt == null || now - b.windowStartedAt > BREAKER_WINDOW_MS;
  const count = fresh ? 1 : b.failureCount + 1;
  const windowStartedAt = fresh ? now : b.windowStartedAt;
  if (count >= BREAKER_THRESHOLD) return { state: "open", failureCount: count, windowStartedAt, openedAt: now };
  return { state: b.state === "open" ? "open" : "closed", failureCount: count, windowStartedAt, openedAt: b.openedAt };
}
