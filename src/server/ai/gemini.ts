import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai";
import { AiCallError } from "@/lib/ai/resilience";
import type { AiProvider, GenerateRequest, GenerateResponse } from "@/lib/ai/types";

/** How long a model is skipped after it answers 429 (its quota is used up), unless Google says longer. */
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

type GenAiModels = Pick<GoogleGenAI["models"], "generateContent">;

/**
 * Gemini behind the AiProvider interface. Only `src/server/ai/*` may import the SDK.
 *
 * `models` is tried in order. Free-tier quotas are counted per model, so when the first model's
 * quota runs out (429) or it is overloaded (5xx), the next one answers in the same call. A model
 * that answered 429 is skipped for a while so later calls don't wait on it.
 */
export class GeminiProvider implements AiProvider {
  private readonly api: GenAiModels;
  private readonly models: string[];
  private readonly coolUntil = new Map<string, number>();
  /** Models that reject `thinkingBudget: 0`; they get `thinkingLevel: MINIMAL` instead. */
  private readonly levelThinking = new Set<string>();

  constructor(apiKey: string, models: string[], api?: GenAiModels, private readonly now: () => number = Date.now) {
    this.models = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
    if (!this.models.length) throw new Error("GeminiProvider needs at least one model");
    this.api = api ?? new GoogleGenAI({ apiKey }).models;
  }

  /** The preferred model (the first one). */
  get model(): string {
    return this.models[0]!;
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const t = this.now();
    const ready = this.models.filter((m) => (this.coolUntil.get(m) ?? 0) <= t);
    // Every model is cooling down: try them all anyway rather than fail without asking.
    const order = ready.length ? ready : this.models;
    let lastError: AiCallError | null = null;
    for (const model of order) {
      try {
        return await this.generateWith(model, req);
      } catch (e) {
        if (!(e instanceof AiCallError) || req.signal.aborted) throw e;
        if (e.kind === "rate_limited") this.coolUntil.set(model, this.now() + Math.max(e.retryAfterMs ?? 0, RATE_LIMIT_COOLDOWN_MS));
        else if (e.kind !== "provider_error") throw e; // 400s, network errors: another model won't help
        lastError = e;
      }
    }
    throw lastError!;
  }

  private thinkingConfig(model: string, thinking: boolean | undefined): ThinkingConfig | undefined {
    if (thinking !== false) return undefined;
    return this.levelThinking.has(model) ? { thinkingLevel: ThinkingLevel.MINIMAL } : { thinkingBudget: 0 };
  }

  private async generateWith(model: string, req: GenerateRequest): Promise<GenerateResponse> {
    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
    if (req.document) parts.push({ inlineData: { mimeType: req.document.mimeType, data: req.document.dataBase64 } });
    parts.push({ text: req.user });
    const call = async () => {
      const thinkingConfig = this.thinkingConfig(model, req.thinking);
      return this.api.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: req.system,
          responseMimeType: "application/json",
          ...(req.jsonSchema ? { responseJsonSchema: req.jsonSchema } : {}),
          ...(thinkingConfig ? { thinkingConfig } : {}),
          temperature: 0.1,
          abortSignal: req.signal,
        },
      });
    };
    try {
      let res;
      try {
        res = await call();
      } catch (e) {
        // Some models (e.g. the "lite" ones) refuse thinkingBudget and want a thinking level.
        if (!(e instanceof ApiError) || e.status !== 400 || req.thinking !== false || this.levelThinking.has(model)) throw e;
        this.levelThinking.add(model);
        res = await call();
      }
      return { text: res.text ?? "", inputTokens: res.usageMetadata?.promptTokenCount, outputTokens: res.usageMetadata?.candidatesTokenCount, model };
    } catch (e) {
      if (req.signal.aborted || (e as Error)?.name === "AbortError") throw new AiCallError("timeout", "request aborted");
      if (e instanceof ApiError) {
        const retryAfter = /retry in ([\d.]+)s/i.exec(e.message)?.[1];
        const message = `${model}: ${e.message}`.slice(0, 200);
        if (e.status === 429) throw new AiCallError("rate_limited", message, 429, retryAfter ? Number(retryAfter) * 1000 : undefined);
        if (e.status >= 500) throw new AiCallError("provider_error", message, e.status);
        throw new AiCallError("bad_request", message, e.status);
      }
      throw new AiCallError("network", String((e as Error)?.message ?? e).slice(0, 200));
    }
  }
}
