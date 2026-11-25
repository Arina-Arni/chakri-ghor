import type { AiFeature, AiOutcome, BreakerState, FaultMode } from "@/types";

/** What a provider (Gemini, or a test double) is asked to do. */
export type GenerateRequest = {
  model: string;
  system: string;
  user: string;
  /** Inline document for vision/OCR (base64). */
  document?: { mimeType: string; dataBase64: string };
  /** JSON Schema for structured output. */
  jsonSchema?: Record<string, unknown>;
  /** false = answer without "thinking" first: ~1 s instead of 6–14 s on newer Gemini models. */
  thinking?: boolean;
  signal: AbortSignal;
};

export type GenerateResponse = { text: string; inputTokens?: number; outputTokens?: number };

export interface AiProvider {
  readonly model: string;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

export type BreakerRecord = {
  state: BreakerState;
  failureCount: number;
  windowStartedAt: number | null;
  openedAt: number | null;
};

export type AiCallLog = {
  feature: AiFeature;
  userId: string | null;
  model: string;
  outcome: AiOutcome;
  attempts: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string | null;
  requestId: string;
};

/** Persistence used by the client: Postgres in the app, memory in unit tests. */
export interface AiStore {
  /** Claim permission to call: "allow", "probe" (half-open, this caller is the probe) or "reject". */
  breakerAcquire(name: string, now: number): Promise<"allow" | "probe" | "reject">;
  breakerSuccess(name: string, now: number): Promise<void>;
  breakerFailure(name: string, now: number): Promise<void>;
  cacheGet(key: string, now: number, allowStale: boolean): Promise<unknown | undefined>;
  cacheSet(key: string, value: unknown, expiresAt: number): Promise<void>;
  /** Count one request against the global provider budget; returns the count this minute. */
  globalTick(now: number): Promise<number>;
  activeFault(actorId: string | null, feature: AiFeature, now: number): Promise<FaultMode | null>;
  log(entry: AiCallLog): Promise<void>;
}

export type { AiFeature, AiOutcome, FaultMode };
