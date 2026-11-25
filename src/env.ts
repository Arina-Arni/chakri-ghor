import { z } from "zod";

/**
 * Environment variables, validated once. Server-only values are read lazily through
 * `serverEnv()` so the browser bundle never contains them and a missing secret fails the
 * first server request with a clear message instead of a confusing runtime error.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  DIRECT_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL").optional(),
  APP_URL: z.url(),
  IP_HASH_SALT: z.string().min(16),
  // Part 3
  CRON_SECRET: z.string().min(16),
  PAYMENT_PROVIDER: z.enum(["mock"]).default("mock"),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
});

/**
 * Optional integrations. Without GEMINI_API_KEY every AI feature uses its fallback (logged as
 * provider_error); without RESEND_API_KEY emails stay in the outbox and in-app notifications
 * still work. FAULT_INJECTION_ALLOWED is off unless exactly "true".
 */
const integrationSchema = z.object({
  GEMINI_API_KEY: z.string().min(10).optional(),
  GEMINI_MODEL: z.string().min(3).default("gemini-3.5-flash"),
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.string().min(3).default("Chakri Radar <noreply@chakri-radar.app>"),
  FAULT_INJECTION_ALLOWED: z.string().optional().transform((v) => v === "true"),
  /** Extra comma-separated hosts allowed for PDF-URL ingest (besides *.gov.bd, teletalk.com.bd). */
  INGEST_ALLOWED_HOSTS: z.string().optional().transform((v) => (v ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [])),
  AI_GLOBAL_RPM: z.coerce.number().int().min(1).default(60),
});

export type IntegrationEnv = z.infer<typeof integrationSchema>;

/** Optional integration settings (never throws). */
export function integrationEnv(): IntegrationEnv {
  return integrationSchema.parse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    FAULT_INJECTION_ALLOWED: process.env.FAULT_INJECTION_ALLOWED,
    INGEST_ALLOWED_HOSTS: process.env.INGEST_ALLOWED_HOSTS,
    AI_GLOBAL_RPM: process.env.AI_GLOBAL_RPM || undefined,
  });
}

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function format(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
}

let cachedServer: ServerEnv | null = null;

/** Validated server environment. Throws (fail fast) when something is missing. */
export function serverEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid or missing environment variables (see .env.example):\n${format(parsed.error)}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

/** Public values are inlined at build time, so they must be referenced literally. */
export function publicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid or missing public environment variables:\n${format(parsed.error)}`);
  }
  return parsed.data;
}

/** True when Supabase is configured (lets local tests run without it). */
export function hasSupabase(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
