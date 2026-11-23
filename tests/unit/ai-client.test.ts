import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAiClient, type CallOptions } from "@/lib/ai/client";
import { MemoryAiStore } from "@/lib/ai/memory-store";
import { AiCallError, backoffMs, breakerOnFailure, CLOSED, extractJson, parseRetryAfter } from "@/lib/ai/resilience";
import type { AiProvider, GenerateRequest } from "@/lib/ai/types";

type Step = string | Error | "hang";

/** A provider that plays back a script, one entry per call. */
function scripted(steps: Step[]): AiProvider & { calls: GenerateRequest[] } {
  const calls: GenerateRequest[] = [];
  return {
    model: "test-flash",
    calls,
    async generate(req) {
      calls.push(req);
      const s = steps.shift() ?? "hang";
      if (s === "hang") return new Promise(() => {});
      if (s instanceof Error) throw s;
      return { text: s, inputTokens: 10, outputTokens: 5 };
    },
  };
}

const schema = z.object({ district_ids: z.array(z.string()), confidence: z.number().min(0).max(1) });
type Out = z.infer<typeof schema>;

function setup(steps: Step[], over: Partial<Parameters<typeof createAiClient>[0]> = {}) {
  const store = new MemoryAiStore();
  const provider = scripted(steps);
  const callAI = createAiClient({
    provider,
    store,
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    random: () => 0.5,
    sha256: async (s) => s,
    globalRpm: 1000,
    faultInjectionAllowed: true,
    ...over,
  });
  const opts = (o: Partial<CallOptions<Out, string>> = {}): CallOptions<Out, string> => ({
    feature: "search_parse",
    input: { q: "খুলনা" },
    prompt: { system: "s", user: "u" },
    schema,
    budgetMs: 4000,
    retries: 1,
    fallback: () => "FALLBACK",
    ctx: { userId: "u1", requestId: "REQ-1", faultActorId: "admin1" },
    semantic: (v) => {
      const known = new Set(["dis_khulna", "dis_dhaka"]);
      const dropped = v.district_ids.filter((d) => !known.has(d));
      return { value: { ...v, district_ids: v.district_ids.filter((d) => known.has(d)) }, issues: dropped.map((d) => `unknown district ${d}`), critical: false };
    },
    ...o,
  });
  return { store, provider, callAI, opts };
}

const GOOD = '{"district_ids":["dis_khulna"],"confidence":0.9}';

beforeEach(() => vi.useFakeTimers({ now: Date.parse("2026-11-23T06:00:00Z") }));
afterEach(() => vi.useRealTimers());

describe("callAI — A06 fault tolerance", () => {
  it("returns validated AI output and logs success", async () => {
    const { callAI, opts, store } = setup([GOOD]);
    const r = await callAI(opts());
    expect(r).toMatchObject({ mode: "ai", value: { district_ids: ["dis_khulna"] } });
    expect(store.logs[0]).toMatchObject({ outcome: "success", attempts: 1, requestId: "REQ-1" });
  });

  it("timeout → fallback within the total budget", async () => {
    const { callAI, opts, store } = setup(["hang", "hang"]);
    const p = callAI(opts({ budgetMs: 4000 }));
    await vi.advanceTimersByTimeAsync(4000);
    const r = await p;
    expect(r).toMatchObject({ mode: "fallback", value: "FALLBACK", outcome: "timeout" });
    expect(store.logs[0].latencyMs).toBeLessThanOrEqual(4000);
  });

  it("429 with Retry-After is honored before retrying", async () => {
    const { callAI, opts, provider } = setup([new AiCallError("rate_limited", "429", 429, 1500), GOOD]);
    const p = callAI(opts({ budgetMs: 10_000 }));
    await vi.advanceTimersByTimeAsync(1499);
    expect(provider.calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const r = await p;
    expect(provider.calls.length).toBe(2);
    expect(r.mode).toBe("ai");
  });

  it("does not start a retry that cannot finish inside the budget", async () => {
    const { callAI, opts, provider } = setup([new AiCallError("rate_limited", "429", 429, 3900), GOOD]);
    const r = await callAI(opts({ budgetMs: 4000 }));
    expect(provider.calls.length).toBe(1);
    expect(r).toMatchObject({ mode: "fallback", outcome: "rate_limited" });
  });

  it("5xx is retried, then falls back", async () => {
    const { callAI, opts, provider } = setup([new AiCallError("provider_error", "503", 503), new AiCallError("provider_error", "500", 500)]);
    const p = callAI(opts({ budgetMs: 20_000, retries: 1 }));
    await vi.runAllTimersAsync();
    const r = await p;
    expect(provider.calls.length).toBe(2);
    expect(r).toMatchObject({ mode: "fallback", outcome: "provider_error" });
  });

  it("400 is never retried", async () => {
    const { callAI, opts, provider } = setup([new AiCallError("bad_request", "400", 400), GOOD]);
    const r = await callAI(opts({ retries: 2 }));
    expect(provider.calls.length).toBe(1);
    expect(r.mode).toBe("fallback");
  });

  it("malformed JSON gets one repair attempt that includes the error", async () => {
    const { callAI, opts, provider } = setup(["Sure! ```json\n{\"district_ids\": [\"dis_khulna\"", GOOD]);
    const r = await callAI(opts());
    expect(r.mode).toBe("ai");
    expect(provider.calls[1].user).toMatch(/previous answer was rejected/);
  });

  it("wrong schema twice → fallback (malformed)", async () => {
    const { callAI, opts } = setup(['{"foo":1}', '{"bar":2}']);
    const r = await callAI(opts());
    expect(r).toMatchObject({ mode: "fallback", outcome: "malformed" });
  });

  it("drops a hallucinated district but keeps the rest", async () => {
    const { callAI, opts, store } = setup(['{"district_ids":["dis_khulna","dis_atlantis"],"confidence":0.8}']);
    const r = await callAI(opts());
    expect(r).toMatchObject({ mode: "ai", value: { district_ids: ["dis_khulna"] } });
    expect(store.logs[0].errorMessage).toMatch(/dis_atlantis/);
  });

  it("critical semantic failure → fallback logged as invalid_semantics", async () => {
    const { callAI, opts, store } = setup([GOOD]);
    const r = await callAI(opts({ semantic: (v) => ({ value: v, issues: ["invented employer"], critical: true }) }));
    expect(r).toMatchObject({ mode: "fallback", outcome: "invalid_semantics" });
    expect(store.logs[0].outcome).toBe("invalid_semantics");
  });

  it("breaker opens after 5 failed calls, short-circuits, then a half-open probe closes it", async () => {
    const fails = Array.from({ length: 5 }, () => new AiCallError("bad_request", "400", 400));
    const { callAI, opts, provider, store } = setup([...fails, GOOD]);
    for (let i = 0; i < 5; i++) await callAI(opts({ retries: 0 }));
    expect(store.breakers.get("search_parse")?.state).toBe("open");
    const blocked = await callAI(opts());
    expect(blocked).toMatchObject({ mode: "fallback", outcome: "circuit_open" });
    expect(provider.calls.length).toBe(5); // no call while open
    vi.advanceTimersByTime(30_000);
    const probe = await callAI(opts());
    expect(probe.mode).toBe("ai");
    expect(store.breakers.get("search_parse")?.state).toBe("closed");
  });

  it("a failed half-open probe re-opens the breaker", () => {
    let b = CLOSED;
    for (let i = 0; i < 5; i++) b = breakerOnFailure(b, 1000 + i);
    expect(b.state).toBe("open");
    const reopened = breakerOnFailure({ ...b, state: "half_open" }, 40_000);
    expect(reopened).toMatchObject({ state: "open", openedAt: 40_000 });
  });

  it("serves a stale cache hit while the breaker is open", async () => {
    const { callAI, opts, store } = setup([]);
    store.cache.set("search_parse\n2026-11-p3.1\n{\"q\":\"খুলনা\"}", { value: { district_ids: ["dis_dhaka"], confidence: 1 }, expiresAt: 0 });
    store.breakers.set("search_parse", { state: "open", failureCount: 5, windowStartedAt: Date.now(), openedAt: Date.now() });
    const r = await callAI(opts({ cacheTtlMs: 60_000 }));
    expect(r).toMatchObject({ mode: "ai", cached: true, value: { district_ids: ["dis_dhaka"] } });
  });

  it("a fresh cache hit avoids the call", async () => {
    const { callAI, opts, provider } = setup([GOOD]);
    await callAI(opts({ cacheTtlMs: 60_000 }));
    const second = await callAI(opts({ cacheTtlMs: 60_000 }));
    expect(provider.calls.length).toBe(1);
    expect(second).toMatchObject({ mode: "ai", cached: true });
  });

  it("over the global budget → fallback without calling", async () => {
    const { callAI, opts, provider } = setup([GOOD], { globalRpm: 0 });
    const r = await callAI(opts());
    expect(provider.calls.length).toBe(0);
    expect(r).toMatchObject({ mode: "fallback", outcome: "fallback_used" });
  });

  it("without a provider (no API key) the fallback is used", async () => {
    const { callAI, opts } = setup([], { provider: null });
    expect(await callAI(opts())).toMatchObject({ mode: "fallback", outcome: "provider_error" });
  });

  describe("fault injection applies only to the admin who turned it on", () => {
    it("malformed_json fault → repair → fallback for that admin", async () => {
      const { callAI, opts, store, provider } = setup([GOOD]);
      store.faults.set("admin1:search_parse", "malformed_json");
      const r = await callAI(opts());
      expect(r).toMatchObject({ mode: "fallback", outcome: "malformed" });
      expect(provider.calls.length).toBe(0);
    });
    it("other users are unaffected", async () => {
      const { callAI, opts, store } = setup([GOOD]);
      store.faults.set("admin1:search_parse", "server_error_500");
      const r = await callAI(opts({ ctx: { userId: "u2", requestId: "R", faultActorId: "someone-else" } }));
      expect(r.mode).toBe("ai");
    });
    it("hallucinated_values corrupts the answer and the semantic check catches it", async () => {
      const { callAI, opts, store } = setup([GOOD]);
      store.faults.set("admin1:search_parse", "hallucinated_values");
      const r = await callAI(opts({ hallucinate: (v) => ({ ...v, district_ids: ["dis_narnia"] }) }));
      expect(r).toMatchObject({ mode: "ai", value: { district_ids: [] } });
    });
    it("faults are ignored unless FAULT_INJECTION_ALLOWED", async () => {
      const { callAI, opts, store } = setup([GOOD], { faultInjectionAllowed: false });
      store.faults.set("admin1:search_parse", "server_error_500");
      expect((await callAI(opts())).mode).toBe("ai");
    });
  });
});

describe("resilience helpers", () => {
  it("full-jitter backoff stays under the capped exponential ceiling", () => {
    expect(backoffMs(0, () => 0.999)).toBeLessThan(300);
    expect(backoffMs(3, () => 0.999)).toBeLessThan(2400);
    expect(backoffMs(10, () => 0.999)).toBeLessThan(4000);
  });
  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("2", 0)).toBe(2000);
    expect(parseRetryAfter(new Date(5000).toUTCString(), 0)).toBe(5000);
  });
  it("extracts the first JSON object from fenced text", () => {
    expect(extractJson('```json\n{"a":{"b":"}"}}\n``` trailing')).toEqual({ a: { b: "}" } });
  });
});
