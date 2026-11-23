import type { CircularAction, CircularStatus } from "@/types";
import { allow, deny, type TransitionCheck } from "./types";

/**
 * Circular lifecycle (spec §4.1):
 *   draft → pending_review → published → closed → archived
 *   pending_review → rejected → draft
 *   published → cancelled
 *   closed → published   (deadline extension within 30 days of closing)
 */
export const CIRCULAR_EDGES: Record<CircularStatus, CircularStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["published", "rejected"],
  published: ["closed", "cancelled"],
  closed: ["archived", "published"],
  rejected: ["draft"],
  cancelled: [],
  archived: [],
};

export const CIRCULAR_STATUSES = Object.keys(CIRCULAR_EDGES) as CircularStatus[];

export const EXTENSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type CircularTransitionCtx = {
  role: "guest" | "seeker" | "moderator" | "admin";
  now: number;
  postCount: number;
  startAt: string;
  endAt: string;
  /** New deadline when extending; it must be later than `endAt`. */
  newEndAt?: string | null;
  organizationExists: boolean;
  organizationVerified: boolean;
  /** When the circular closed (or its deadline passed). Used for the 30-day extension window. */
  closedAt?: string | null;
  reason?: string | null;
};

const isStaff = (role: CircularTransitionCtx["role"]) => role === "moderator" || role === "admin";

/** Whether `from → to` is legal for this circular and actor. Pure; services enforce it. */
export function canTransitionCircular(
  from: CircularStatus,
  to: CircularStatus,
  ctx: CircularTransitionCtx,
): TransitionCheck {
  if (!CIRCULAR_EDGES[from].includes(to)) {
    return deny("ILLEGAL_EDGE", "এই অবস্থা থেকে সরাসরি সেখানে যাওয়া যায় না।");
  }
  if (!isStaff(ctx.role)) return deny("FORBIDDEN", "এই কাজের অনুমতি আপনার নেই।");

  if (from === "pending_review" && to === "rejected" && !ctx.reason?.trim()) {
    return deny("REASON_REQUIRED", "প্রত্যাখ্যানের কারণ লিখুন।");
  }

  if (to === "published" && from === "pending_review") {
    if (ctx.postCount < 1) return deny("NO_POSTS", "কমপক্ষে একটি পদ দরকার।");
    if (!ctx.organizationExists) return deny("NO_ORGANIZATION", "প্রতিষ্ঠান পাওয়া যায়নি।");
    if (!ctx.organizationVerified && ctx.role !== "admin") {
      return deny("ORG_UNVERIFIED", "যাচাই না করা প্রতিষ্ঠানের সার্কুলার শুধু অ্যাডমিন প্রকাশ করতে পারেন।");
    }
    if (new Date(ctx.endAt).getTime() <= new Date(ctx.startAt).getTime()) {
      return deny("END_BEFORE_START", "শেষ সময় শুরুর সময়ের পরে হতে হবে।");
    }
    if (new Date(ctx.endAt).getTime() <= ctx.now) {
      return deny("DEADLINE_PASSED", "আবেদনের শেষ সময় পেরিয়ে গেছে — প্রকাশ করা যাবে না।");
    }
  }

  if (from === "closed" && to === "published") {
    return canExtendDeadline("closed", ctx);
  }

  if (from === "published" && to === "closed" && new Date(ctx.endAt).getTime() > ctx.now) {
    return deny("STILL_OPEN", "আবেদনের সময় এখনো শেষ হয়নি।");
  }

  return allow();
}

/** Deadline extension (সময় বৃদ্ধি): published, or closed ≤ 30 days ago; new end later than old. */
export function canExtendDeadline(from: CircularStatus, ctx: CircularTransitionCtx): TransitionCheck {
  if (!isStaff(ctx.role)) return deny("FORBIDDEN", "এই কাজের অনুমতি আপনার নেই।");
  if (from !== "published" && from !== "closed") {
    return deny("ILLEGAL_EDGE", "শুধু প্রকাশিত বা সম্প্রতি বন্ধ হওয়া সার্কুলারের সময় বাড়ানো যায়।");
  }
  if (from === "closed") {
    const closedAt = new Date(ctx.closedAt ?? ctx.endAt).getTime();
    if (ctx.now - closedAt > EXTENSION_WINDOW_MS) {
      return deny("EXTENSION_WINDOW", "বন্ধ হওয়ার ৩০ দিন পেরিয়ে গেছে — আর সময় বাড়ানো যাবে না।");
    }
  }
  if (!ctx.newEndAt) return deny("NEW_END_REQUIRED", "নতুন শেষ সময় দিন।");
  if (new Date(ctx.newEndAt).getTime() <= new Date(ctx.endAt).getTime()) {
    return deny("NEW_END_NOT_LATER", "নতুন তারিখ আগের শেষ তারিখের পরে হতে হবে।");
  }
  if (new Date(ctx.newEndAt).getTime() <= ctx.now) {
    return deny("NEW_END_PAST", "নতুন শেষ সময় ভবিষ্যতে হতে হবে।");
  }
  return allow();
}

/**
 * The stored status as seekers should see it: a published circular whose deadline has passed
 * is closed even before the scheduler (Part 3) writes that.
 */
export function effectiveCircularStatus(status: CircularStatus, endAt: string, now: number): CircularStatus {
  return status === "published" && new Date(endAt).getTime() <= now ? "closed" : status;
}

/** Admin row actions → the status they move to (extend keeps or restores `published`). */
export const CIRCULAR_ACTIONS: Record<CircularAction, { from: CircularStatus[]; to: CircularStatus }> = {
  submit_review: { from: ["draft", "rejected"], to: "pending_review" },
  approve: { from: ["pending_review"], to: "published" },
  reject: { from: ["pending_review"], to: "rejected" },
  extend: { from: ["published", "closed"], to: "published" },
  cancel: { from: ["published"], to: "cancelled" },
  archive: { from: ["closed"], to: "archived" },
};

/**
 * The chain of single-step transitions an action performs. `submit_review` from `rejected`
 * goes back to `draft` first, so every hop is a legal edge.
 */
export function actionPath(action: CircularAction, from: CircularStatus): CircularStatus[] | null {
  const rule = CIRCULAR_ACTIONS[action];
  if (!rule.from.includes(from)) return null;
  if (action === "extend") return from === "closed" ? ["published"] : [];
  if (action === "submit_review" && from === "rejected") return ["draft", "pending_review"];
  return [rule.to];
}

/** Row actions to offer for a circular in its current (effective) status. */
export function allowedCircularActions(status: CircularStatus): CircularAction[] {
  return (Object.keys(CIRCULAR_ACTIONS) as CircularAction[]).filter((a) =>
    CIRCULAR_ACTIONS[a].from.includes(status),
  );
}
