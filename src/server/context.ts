import "server-only";

export type StaffRole = "moderator" | "admin";
export type UserRole = "seeker" | StaffRole | "employer";

export type Actor =
  | { kind: "guest" }
  | { kind: "user"; userId: string; role: UserRole; status: "active" | "suspended"; email: string };

/** Everything a service needs to know about the request. Built only on the server. */
export type Ctx = {
  actor: Actor;
  requestId: string;
  /** Salted hash of the client IP; raw IPs are never stored. */
  ipHash: string | null;
  userAgent: string | null;
  /** Visitor key for once-per-day counters (user id or IP hash). */
  visitorKey: string;
  now: () => number;
};

export const GUEST: Actor = { kind: "guest" };

export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `REQ-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function isStaff(actor: Actor): boolean {
  return actor.kind === "user" && (actor.role === "moderator" || actor.role === "admin");
}

export function roleOf(actor: Actor): "guest" | UserRole {
  return actor.kind === "guest" ? "guest" : actor.role;
}
