import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { hasSupabase, serverEnv } from "@/env";
import { GUEST, newRequestId, type Actor, type Ctx } from "@/server/context";
import { getDb } from "@/server/db/client";
import { profiles } from "@/server/db/schema";
import { supabaseServer } from "@/server/supabase";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Salted hash of an IP address. Raw IPs are never stored. */
export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  return (await sha256Hex(`${serverEnv().IP_HASH_SALT}:${ip}`)).slice(0, 32);
}

function clientIp(h: Headers): string | null {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/**
 * The signed-in user, verified on the server. `getClaims()` validates the JWT signature (never
 * trust `getSession()` on the server). Role and status always come from `profiles`, never from
 * the client.
 */
export async function resolveActor(): Promise<Actor> {
  if (!hasSupabase()) return GUEST;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return GUEST;
  const [row] = await getDb().select({ role: profiles.role, status: profiles.status }).from(profiles).where(eq(profiles.userId, sub));
  if (!row) return GUEST;
  return { kind: "user", userId: sub, role: row.role, status: row.status, email: String(data.claims.email ?? "") };
}

/** Build the per-request context from headers + session. */
export async function requestCtx(): Promise<Ctx> {
  const h = await headers();
  const [actor, ipHash] = await Promise.all([resolveActor(), hashIp(clientIp(h))]);
  return {
    actor,
    requestId: h.get("x-request-id")?.slice(0, 40) || newRequestId(),
    ipHash,
    userAgent: h.get("user-agent"),
    visitorKey: actor.kind === "user" ? `u:${actor.userId}` : `ip:${ipHash ?? "unknown"}`,
    now: () => Date.now(),
  };
}

export { safeNext } from "@/lib/safe-next";
