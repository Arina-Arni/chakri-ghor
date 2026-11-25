/** Tiny app-wide event bus for cross-cutting UI (session expiry). */

const SESSION_EXPIRED = "cr:session-expired";

export function notifySessionExpired(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED));
}

export function onSessionExpired(listener: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED, listener);
  return () => window.removeEventListener(SESSION_EXPIRED, listener);
}

let leaving = false;

/**
 * Leave the app with a full page load (logout, account deletion). Two client-side navigations
 * racing each other (e.g. `router.push("/")` here and the role gate's redirect to /login) can
 * leave the Next.js router queue stuck, and then every later Server Action — including the next
 * login — waits forever. A full load also clears all client state of the old session.
 */
export function leaveTo(href: string): void {
  leaving = true;
  window.location.assign(href);
}

/** True once `leaveTo` has started a full page load; screens must not redirect on their own. */
export function isLeaving(): boolean {
  return leaving;
}
