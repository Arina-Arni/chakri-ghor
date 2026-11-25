import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";

vi.mock("server-only", () => ({}));

const { GeminiProvider } = await import("@/server/ai/gemini");
const { AiCallError } = await import("@/lib/ai/resilience");

type Call = { model: string; config: { thinkingConfig?: Record<string, unknown> } };

/** A fake `models.generateContent` that answers per model from a script. */
function fakeApi(script: Record<string, (call: Call) => unknown>) {
  const calls: Call[] = [];
  const generateContent = vi.fn(async (params: Call) => {
    calls.push(params);
    const answer = script[params.model];
    if (!answer) throw new Error(`unexpected model ${params.model}`);
    return answer(params);
  });
  return { api: { generateContent } as never, calls };
}

const ok = (text: string) => () => ({ text, usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } });
const fail = (status: number, message = "error") => () => {
  throw new ApiError({ message, status });
};
const req = (over: Partial<Parameters<InstanceType<typeof GeminiProvider>["generate"]>[0]> = {}) => ({
  model: "a",
  system: "s",
  user: "u",
  thinking: false,
  signal: new AbortController().signal,
  ...over,
});

describe("GeminiProvider model fallback", () => {
  it("uses the first model when it answers", async () => {
    const { api, calls } = fakeApi({ a: ok("{}"), b: ok("{}") });
    const p = new GeminiProvider("k", ["a", "b"], api);
    const r = await p.generate(req());
    expect(r.model).toBe("a");
    expect(calls.map((c) => c.model)).toEqual(["a"]);
    expect(p.model).toBe("a");
  });

  it("falls to the next model on 429 and skips the exhausted one afterwards", async () => {
    let now = 1_000;
    const { api, calls } = fakeApi({ a: fail(429, "quota. Please retry in 30s."), b: ok('{"x":1}') });
    const p = new GeminiProvider("k", ["a", "b"], api, () => now);
    expect((await p.generate(req())).model).toBe("b");
    expect((await p.generate(req())).model).toBe("b");
    expect(calls.map((c) => c.model)).toEqual(["a", "b", "b"]);
    // After the cooldown the preferred model is asked again.
    now += 6 * 60_000;
    await p.generate(req());
    expect(calls.map((c) => c.model)).toEqual(["a", "b", "b", "a", "b"]);
  });

  it("falls to the next model on 5xx without cooling the first one down", async () => {
    const { api, calls } = fakeApi({ a: fail(503, "overloaded"), b: ok("{}") });
    const p = new GeminiProvider("k", ["a", "b"], api);
    await p.generate(req());
    await p.generate(req());
    expect(calls.map((c) => c.model)).toEqual(["a", "b", "a", "b"]);
  });

  it("throws rate_limited when every model is out of quota", async () => {
    const { api } = fakeApi({ a: fail(429), b: fail(429) });
    const p = new GeminiProvider("k", ["a", "b"], api);
    await expect(p.generate(req())).rejects.toMatchObject({ kind: "rate_limited" });
    // All cooling down: they are still tried rather than failing without asking.
    await expect(p.generate(req())).rejects.toBeInstanceOf(AiCallError);
  });

  it("does not try other models on a 400", async () => {
    const { api, calls } = fakeApi({ a: fail(400, "bad schema"), b: ok("{}") });
    const p = new GeminiProvider("k", ["a", "b"], api);
    await expect(p.generate(req({ thinking: undefined }))).rejects.toMatchObject({ kind: "bad_request" });
    expect(calls.map((c) => c.model)).toEqual(["a"]);
  });

  it("switches a model that rejects thinkingBudget to a thinking level, once", async () => {
    const { api, calls } = fakeApi({
      a: (c) => {
        if (c.config.thinkingConfig && "thinkingBudget" in c.config.thinkingConfig) throw new ApiError({ message: "invalid argument", status: 400 });
        return { text: "{}" };
      },
    });
    const p = new GeminiProvider("k", ["a"], api);
    expect((await p.generate(req())).text).toBe("{}");
    expect((await p.generate(req())).text).toBe("{}");
    expect(calls.map((c) => c.config.thinkingConfig)).toEqual([{ thinkingBudget: 0 }, { thinkingLevel: "MINIMAL" }, { thinkingLevel: "MINIMAL" }]);
  });

  it("sends no thinking config when thinking is not turned off", async () => {
    const { api, calls } = fakeApi({ a: ok("{}") });
    await new GeminiProvider("k", ["a"], api).generate(req({ thinking: undefined }));
    expect(calls[0]!.config.thinkingConfig).toBeUndefined();
  });
});
