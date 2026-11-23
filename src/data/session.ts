import type { Role } from "@/types";

/**
 * Client-side mirror of the server session, for synchronous UI checks. The server decides
 * the role (profiles.role); this only caches what `getMe()` returned.
 */
const listeners = new Set<() => void>();
let currentRole: Role = "guest";

export function getRole(): Role {
  return currentRole;
}

/** Called by the session provider after `getMe()`. */
export function setRole(role: Role): void {
  currentRole = role;
}

/** Ask every subscriber (session provider) to re-fetch the session: login, logout, account changes. */
export function notifySessionChanged(): void {
  listeners.forEach((l) => l());
}

/** Subscribe to session changes (this tab and Supabase auth events). Returns an unsubscribe. */
export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  let unsubscribeAuth: (() => void) | null = null;
  void import("@/lib/supabase-browser").then(({ supabaseBrowser }) => {
    const client = supabaseBrowser();
    if (!client || !listeners.has(listener)) return;
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") listener();
    });
    unsubscribeAuth = () => data.subscription.unsubscribe();
  });
  return () => {
    listeners.delete(listener);
    unsubscribeAuth?.();
  };
}
