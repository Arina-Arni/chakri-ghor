import "server-only";
import { AppError } from "@/server/errors";
import type { Actor, UserRole } from "@/server/context";

/** Every action a service can perform (spec §2 role matrix). */
export type Action =
  | "circular.browse"
  | "seeker.own" // bookmarks, eligibility, tracker, resumes, saved searches, profile, notifications
  | "circular.edit_draft"
  | "circular.moderate" // approve / reject / publish / extend / cancel / archive
  | "organization.verify"
  | "organization.edit"
  | "user.manage" // list users, change roles, suspend
  | "audit.read"
  | "settings.manage"
  | "admin.dashboard";

type RoleOrGuest = "guest" | UserRole;

/** Role matrix. `seeker.own` is "own rows only" — ownership is checked separately. */
export const ROLE_MATRIX: Record<Action, RoleOrGuest[]> = {
  "circular.browse": ["guest", "seeker", "moderator", "admin", "employer"],
  "seeker.own": ["seeker", "moderator", "admin", "employer"],
  "circular.edit_draft": ["moderator", "admin"],
  "circular.moderate": ["moderator", "admin"],
  "organization.verify": ["moderator", "admin"],
  "organization.edit": ["moderator", "admin"],
  "user.manage": ["admin"],
  "audit.read": ["admin"],
  "settings.manage": ["admin"],
  "admin.dashboard": ["moderator", "admin"],
};

/** Actions that change data; suspended users can do none of them. */
const MUTATING: Action[] = [
  "seeker.own",
  "circular.edit_draft",
  "circular.moderate",
  "organization.verify",
  "organization.edit",
  "user.manage",
  "settings.manage",
];

/**
 * Central authorization (spec §2). Every service function calls this first.
 * Throws UNAUTHENTICATED for guests on protected actions and FORBIDDEN for wrong roles.
 * `opts.mutation` marks writes so suspended accounts are blocked.
 */
export function authorize(actor: Actor, action: Action, opts: { mutation?: boolean } = {}): asserts actor is Actor {
  const role: RoleOrGuest = actor.kind === "guest" ? "guest" : actor.role;
  if (!ROLE_MATRIX[action].includes(role)) {
    throw new AppError(role === "guest" ? "UNAUTHENTICATED" : "FORBIDDEN");
  }
  if (actor.kind === "user" && actor.status === "suspended" && (opts.mutation ?? MUTATING.includes(action))) {
    throw new AppError("FORBIDDEN", { message_bn: "আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে।" });
  }
}

/** The signed-in user's id, after authorizing `action`. */
export function requireUser(actor: Actor, action: Action = "seeker.own", opts: { mutation?: boolean } = {}): string {
  authorize(actor, action, opts);
  if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
  return actor.userId;
}

/**
 * Ownership check for user-owned rows. Someone else's (or a missing) row is reported as
 * NOT_FOUND — never FORBIDDEN — so ids don't reveal that a resource exists.
 */
export function assertOwner<T extends { userId: string }>(actor: Actor, row: T | null | undefined): T {
  if (!row || actor.kind !== "user" || row.userId !== actor.userId) throw new AppError("NOT_FOUND");
  return row;
}
