import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { AiCallError } from "@/lib/ai/resilience";
import type { AiProvider, GenerateRequest, GenerateResponse } from "@/lib/ai/types";

/** Gemini behind the AiProvider interface. Only `src/server/ai/*` may import the SDK. */
export class GeminiProvider implements AiProvider {
  private readonly client: GoogleGenAI;
  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
    if (req.document) parts.push({ inlineData: { mimeType: req.document.mimeType, data: req.document.dataBase64 } });
    parts.push({ text: req.user });
    try {
      const res = await this.client.models.generateContent({
        model: req.model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: req.system,
          responseMimeType: "application/json",
          ...(req.jsonSchema ? { responseJsonSchema: req.jsonSchema } : {}),
          ...(req.thinking === false ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          temperature: 0.1,
          abortSignal: req.signal,
        },
      });
      return { text: res.text ?? "", inputTokens: res.usageMetadata?.promptTokenCount, outputTokens: res.usageMetadata?.candidatesTokenCount };
    } catch (e) {
      if (req.signal.aborted || (e as Error)?.name === "AbortError") throw new AiCallError("timeout", "request aborted");
      if (e instanceof ApiError) {
        const retryAfter = /retry in ([\d.]+)s/i.exec(e.message)?.[1];
        if (e.status === 429) throw new AiCallError("rate_limited", e.message.slice(0, 200), 429, retryAfter ? Number(retryAfter) * 1000 : undefined);
        if (e.status >= 500) throw new AiCallError("provider_error", e.message.slice(0, 200), e.status);
        throw new AiCallError("bad_request", e.message.slice(0, 200), e.status);
      }
      throw new AiCallError("network", String((e as Error)?.message ?? e).slice(0, 200));
    }
  }
}
