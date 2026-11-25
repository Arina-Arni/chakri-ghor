import "server-only";
import { integrationEnv } from "@/env";
import { createAiClient, type CallAI } from "@/lib/ai/client";
import type { AiProvider, AiStore } from "@/lib/ai/types";
import { GeminiProvider } from "./gemini";
import { DbAiStore } from "./store";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let client: CallAI | null = null;
let overrides: { provider?: AiProvider | null; store?: AiStore; faultInjectionAllowed?: boolean } | null = null;

/** Tests swap the provider (a scripted fake) and/or the store. */
export function setAiForTests(o: typeof overrides): void {
  overrides = o;
  client = null;
}

/** The app's single AI client (Gemini + Postgres store). */
export function ai(): CallAI {
  if (client) return client;
  const env = integrationEnv();
  const provider = overrides && "provider" in overrides ? (overrides.provider ?? null) : env.GEMINI_API_KEY ? new GeminiProvider(env.GEMINI_API_KEY, [env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODELS]) : null;
  client = createAiClient({
    provider,
    store: overrides?.store ?? new DbAiStore(),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    random: Math.random,
    sha256,
    globalRpm: env.AI_GLOBAL_RPM,
    faultInjectionAllowed: overrides?.faultInjectionAllowed ?? env.FAULT_INJECTION_ALLOWED,
  });
  return client;
}

export { sha256 };
