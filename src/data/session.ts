// TEMP — replaced by the real implementation in Part 2 (Supabase Auth session)
import type { Role } from "@/types";

const KEY = "cr:mockRole";
const listeners = new Set<() => void>();
let memoryRole: Role | null = null;

function readStored(): Role {
  if (memoryRole) return memoryRole;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "guest" || v === "seeker" || v === "moderator" || v === "admin") return v;
  } catch {
    // storage blocked (private mode) — fall through to the default
  }
  return "guest";
}

/** Current mock role. On the server there is no session, so "guest". */
export function getRole(): Role {
  if (typeof window === "undefined") return "guest";
  return readStored();
}

export function setRole(role: Role): void {
  memoryRole = role;
  try {
    window.localStorage.setItem(KEY, role);
  } catch {
    // keep the in-memory value
  }
  listeners.forEach((l) => l());
}

/** Subscribe to session changes (login, logout, role switch). Returns an unsubscribe. */
export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      memoryRole = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
