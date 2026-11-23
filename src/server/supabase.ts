import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/env";

/** Supabase client bound to the request's auth cookies (httpOnly, set by @supabase/ssr). */
export async function supabaseServer(): Promise<SupabaseClient> {
  const env = publicEnv();
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component render: cookies are read-only there; the proxy refreshes them.
        }
      },
    },
  });
}

/** Stateless client used only to re-check a password (re-authentication). */
function statelessClient(): SupabaseClient {
  const env = publicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Service-role client for admin auth operations (account deletion, storage signing). Server only. */
export function supabaseAdmin(): SupabaseClient {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type PasswordCheck = (email: string, password: string) => Promise<boolean>;
let passwordCheckOverride: PasswordCheck | null = null;

/** Tests replace the Supabase password check. */
export function setPasswordCheckForTests(fn: PasswordCheck | null): void {
  passwordCheckOverride = fn;
}

/** Re-authentication: does this password belong to this email? Never creates a session. */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (passwordCheckOverride) return passwordCheckOverride(email, password);
  if (!email || !password) return false;
  const { data, error } = await statelessClient().auth.signInWithPassword({ email, password });
  if (error || !data.user) return false;
  await statelessClient().auth.signOut().catch(() => {});
  return true;
}

/** Signed URL (≤ 5 minutes) for a private circular PDF. */
export async function signedPdfUrl(path: string, seconds = 300): Promise<string | null> {
  const { data, error } = await supabaseAdmin().storage.from("circular-pdfs").createSignedUrl(path, Math.min(seconds, 300));
  return error ? null : data.signedUrl;
}
