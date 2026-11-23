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
});

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
