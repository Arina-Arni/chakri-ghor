/**
 * The one AI client (spec Part 3 §2). Every AI feature calls `callAI`; nothing else touches the
 * SDK. It applies, in order: fault injection (admin's own requests only) → circuit breaker
 * (stale cache while open) → fresh cache → global provider budget → attempts with timeouts,
 * full-jitter backoff, Retry-After and deadline propagation → JSON extraction → Zod shape check
 * with one repair retry → semantic validation → logging, breaker bookkeeping and caching.
 * Any failure returns the feature's fallback with the reason — never throws to the caller.
 */
import type { ZodType } from "zod";
import {
  AiCallError,
  MalformedJsonError,
  canStartAttempt,
  extractJson,
  isRetryable,
  nextDelay,
} from "./resilience";
import type { AiFeature, AiOutcome, AiProvider, AiStore, FaultMode } from "./types";

export const PROMPT_VERSION = "2026-11-p3.1";
const MIN_ATTEMPT_MS = 400;

export type SemanticResult<T> = { value: T; issues: string[]; critical: boolean };

export type CallOptions<T, F> = {
  feature: AiFeature;
  /** Normalized input; part of the cache key. */
  input: unknown;
  prompt: { system: string; user: string; document?: { mimeType: string; dataBase64: string } };
  schema: ZodType<T>;
  jsonSchema?: Record<string, unknown>;
  /** Total time budget, including retries. */
  budgetMs: number;
  /** Per-attempt timeout (defaults to the remaining budget). */
  attemptTimeoutMs?: number;
  /** Retries after the first attempt (the repair attempt is extra). */
  retries: number;
  cacheTtlMs?: number;
  semantic?: (value: T) => SemanticResult<T>;
  /** Used by the `hallucinated_values` fault: corrupt a valid answer the way a model might. */
  hallucinate?: (value: T) => T;
  fallback: (reason: AiOutcome) => F | Promise<F>;
  ctx: { userId: string | null; requestId: string; faultActorId?: string | null };
};

export type CallResult<T, F> =
  | { mode: "ai"; value: T; outcome: "success"; cached: boolean; issues: string[] }
  | { mode: "fallback"; value: F; outcome: AiOutcome; reason: string };

export type AiDeps = {
  provider: AiProvider | null;
  store: AiStore;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  sha256: (text: string) => Promise<string>;
  globalRpm: number;
  faultInjectionAllowed: boolean;
};

function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

/** Simulated provider behaviour for a fault mode (applied before the real call). */
async function faulted(mode: FaultMode, signal: AbortSignal): Promise<string> {
  switch (mode) {
    case "timeout":
      return new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new AiCallError("timeout", "injected timeout"))));
    case "rate_limited_429":
      throw new AiCallError("rate_limited", "injected 429", 429, 1000);
    case "server_error_500":
      throw new AiCallError("provider_error", "injected 500", 500);
    case "malformed_json":
      return '{"answer": "unterminated';
    case "wrong_schema":
      return '{"unexpected": true, "items": "not-an-array"}';
    default:
      throw new AiCallError("provider_error", `unknown fault ${mode}`, 500);
  }
}

export function createAiClient(deps: AiDeps) {
  async function attempt(
    opts: { user: string; system: string; document?: { mimeType: string; dataBase64: string }; jsonSchema?: Record<string, unknown> },
    timeoutMs: number,
    fault: FaultMode | null,
  ): Promise<{ text: string; inputTokens?: number; outputTokens?: number }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AiCallError("timeout", `timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    });
    try {
      const work =
        fault && fault !== "hallucinated_values"
          ? faulted(fault, controller.signal).then((text) => ({ text }))
          : deps.provider!.generate({ model: deps.provider!.model, ...opts, signal: controller.signal });
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return async function callAI<T, F>(o: CallOptions<T, F>): Promise<CallResult<T, F>> {
    const started = deps.now();
    const deadline = started + o.budgetMs;
    const model = deps.provider?.model ?? "none";
    const cacheKey = o.cacheTtlMs ? await deps.sha256(`${o.feature}\n${PROMPT_VERSION}\n${stable(o.input)}`) : null;
    let attempts = 0;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    const log = (outcome: AiOutcome, errorMessage: string | null) =>
      deps.store
        .log({ feature: o.feature, userId: o.ctx.userId, model, outcome, attempts, latencyMs: deps.now() - started, inputTokens, outputTokens, errorMessage, requestId: o.ctx.requestId })
        .catch(() => {});
    const fallback = async (outcome: AiOutcome, reason: string): Promise<CallResult<T, F>> => {
      await log(outcome, reason);
      return { mode: "fallback", value: await o.fallback(outcome), outcome, reason };
    };

    const fault = deps.faultInjectionAllowed ? await deps.store.activeFault(o.ctx.faultActorId ?? null, o.feature, started) : null;

    if (!deps.provider && !fault) return fallback("provider_error", "AI provider not configured");

    // Circuit breaker: while open, go straight to the fallback (stale cache if we have it).
    const gate = await deps.store.breakerAcquire(o.feature, started);
    if (gate === "reject") {
      if (cacheKey && !fault) {
        const stale = await deps.store.cacheGet(cacheKey, started, true);
        if (stale !== undefined) {
          const parsed = o.schema.safeParse(stale);
          if (parsed.success) return { mode: "ai", value: parsed.data, outcome: "success", cached: true, issues: ["stale-cache"] };
        }
      }
      return fallback("circuit_open", "circuit breaker open");
    }

    if (cacheKey && !fault) {
      const hit = await deps.store.cacheGet(cacheKey, started, false);
      if (hit !== undefined) {
        const parsed = o.schema.safeParse(hit);
        if (parsed.success) {
          if (gate === "probe") await deps.store.breakerSuccess(o.feature, deps.now());
          return { mode: "ai", value: parsed.data, outcome: "success", cached: true, issues: [] };
        }
      }
    }

    if ((await deps.store.globalTick(started)) > deps.globalRpm) return fallback("fallback_used", "global AI budget reached");

    const failBreaker = () => deps.store.breakerFailure(o.feature, deps.now());
    let user = o.prompt.user;
    let repaired = false;
    let lastError: unknown = null;

    for (let i = 0; i <= o.retries + 1; i++) {
      const remaining = deadline - deps.now();
      if (remaining < MIN_ATTEMPT_MS) break;
      attempts++;
      let text: string;
      try {
        const r = await attempt({ system: o.prompt.system, user, document: o.prompt.document, jsonSchema: o.jsonSchema }, Math.min(o.attemptTimeoutMs ?? remaining, remaining), fault);
        text = r.text;
        inputTokens = (inputTokens ?? 0) + (r.inputTokens ?? 0) || undefined;
        outputTokens = (outputTokens ?? 0) + (r.outputTokens ?? 0) || undefined;
      } catch (e) {
        lastError = e;
        if (!isRetryable(e) || i >= o.retries) break;
        const delay = nextDelay(e, i, deps.random);
        if (!canStartAttempt(deps.now(), deadline, delay, MIN_ATTEMPT_MS)) break;
        await deps.sleep(delay);
        continue;
      }

      // Parse → shape check → (one repair) → semantics.
      let raw: unknown;
      let problem: string | null = null;
      try {
        raw = extractJson(text);
      } catch (e) {
        problem = `malformed: ${(e as MalformedJsonError).message}`;
      }
      if (!problem) {
        const parsed = o.schema.safeParse(raw);
        if (!parsed.success) problem = `schema: ${parsed.error.issues.slice(0, 3).map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`;
        else {
          let value = parsed.data;
          if (fault === "hallucinated_values" && o.hallucinate) value = o.hallucinate(value);
          const sem = o.semantic ? o.semantic(value) : { value, issues: [], critical: false };
          if (sem.critical) {
            await deps.store.breakerSuccess(o.feature, deps.now()); // the provider is healthy; the answer was wrong
            return fallback("invalid_semantics", sem.issues.join("; ") || "invalid semantics");
          }
          await deps.store.breakerSuccess(o.feature, deps.now());
          if (cacheKey) await deps.store.cacheSet(cacheKey, sem.value, deps.now() + (o.cacheTtlMs ?? 0));
          await log("success", sem.issues.length ? `dropped: ${sem.issues.join("; ")}` : null);
          return { mode: "ai", value: sem.value, outcome: "success", cached: false, issues: sem.issues };
        }
      }
      // One repair attempt with the error and a stricter instruction.
      if (repaired) {
        await failBreaker();
        return fallback("malformed", problem);
      }
      repaired = true;
      lastError = new MalformedJsonError(problem);
      user = `${o.prompt.user}\n\nYour previous answer was rejected (${problem}). Reply with ONLY one JSON object that matches the schema exactly. No prose, no code fences. Use null for unknown values.`;
      i--; // the repair does not consume a retry
    }

    await failBreaker();
    if (lastError instanceof MalformedJsonError) return fallback("malformed", lastError.message);
    if (lastError instanceof AiCallError) {
      const outcome: AiOutcome = lastError.kind === "timeout" ? "timeout" : lastError.kind === "rate_limited" ? "rate_limited" : "provider_error";
      return fallback(outcome, lastError.message);
    }
    return fallback("timeout", "time budget exhausted");
  };
}

export type CallAI = ReturnType<typeof createAiClient>;
