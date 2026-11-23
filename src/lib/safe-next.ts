/** Only same-site relative paths are allowed after login (no open redirect). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n\t]/.test(next)) return fallback;
  try {
    // Reject anything that resolves to another origin (e.g. "/\evil.com", encoded tricks).
    const u = new URL(next, "https://chakri-radar.local");
    if (u.origin !== "https://chakri-radar.local") return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}