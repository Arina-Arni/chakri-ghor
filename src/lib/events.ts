/** Tiny app-wide event bus for cross-cutting UI (session expiry). */

const SESSION_EXPIRED = "cr:session-expired";

export function notifySessionExpired(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED));
}

export function onSessionExpired(listener: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED, listener);
  return () => window.removeEventListener(SESSION_EXPIRED, listener);
}
