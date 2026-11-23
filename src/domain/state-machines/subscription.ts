/**
 * Subscription lifecycle (spec Part 3 §5):
 *   none(free) → trialing → active → past_due → grace → expired
 *   active + cancel_at_period_end → expired at period end
 *   expired | none | past_due | grace → active on payment
 * Trial only once. Grace lasts 3 days and keeps premium quotas; expired = free immediately.
 */
export type SubStatus = "none" | "trialing" | "active" | "past_due" | "grace" | "expired";

export type SubState = {
  status: SubStatus;
  planCode: "free" | "premium";
  trialEndsAt: number | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  graceEndsAt: number | null;
  cancelAtPeriodEnd: boolean;
  trialUsed: boolean;
};

export const TRIAL_MS = 7 * 86_400_000;
export const GRACE_MS = 3 * 86_400_000;
export const EXPIRING_SOON_MS = 86_400_000;

export const SUB_EDGES: Record<SubStatus, SubStatus[]> = {
  none: ["trialing", "active"],
  trialing: ["active", "expired"],
  active: ["past_due", "expired", "active"],
  past_due: ["grace", "active", "expired"],
  grace: ["expired", "active"],
  expired: ["active"],
};

export function canMoveSubscription(from: SubStatus, to: SubStatus): boolean {
  return SUB_EDGES[from].includes(to);
}

export const FREE: SubState = {
  status: "none",
  planCode: "free",
  trialEndsAt: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  cancelAtPeriodEnd: false,
  trialUsed: false,
};

export type SubResult = { ok: true; state: SubState } | { ok: false; reasonCode: string; message_bn: string };

export function startTrial(s: SubState, now: number): SubResult {
  if (s.trialUsed) return { ok: false, reasonCode: "TRIAL_USED", message_bn: "ট্রায়াল আগেই ব্যবহার করা হয়েছে" };
  if (!canMoveSubscription(s.status, "trialing")) return { ok: false, reasonCode: "ILLEGAL", message_bn: "এই অবস্থায় ট্রায়াল শুরু করা যায় না" };
  return {
    ok: true,
    state: { ...s, status: "trialing", planCode: "premium", trialUsed: true, trialEndsAt: now + TRIAL_MS, currentPeriodStart: now, currentPeriodEnd: now + TRIAL_MS, cancelAtPeriodEnd: false, graceEndsAt: null },
  };
}

/** A successful payment starts (or extends) a paid period. */
export function applyPayment(s: SubState, now: number, periodMs: number): SubResult {
  if (!canMoveSubscription(s.status, "active")) return { ok: false, reasonCode: "ILLEGAL", message_bn: "এই অবস্থায় পেমেন্ট প্রয়োগ করা যায় না" };
  // Paying during an active period extends from its end, otherwise from now.
  const from = s.status === "active" && s.currentPeriodEnd && s.currentPeriodEnd > now ? s.currentPeriodEnd : now;
  return {
    ok: true,
    state: { ...s, status: "active", planCode: "premium", currentPeriodStart: from === now ? now : s.currentPeriodStart, currentPeriodEnd: from + periodMs, graceEndsAt: null, cancelAtPeriodEnd: false },
  };
}

export function setCancel(s: SubState, cancel: boolean): SubResult {
  if (s.status !== "active" && s.status !== "trialing") return { ok: false, reasonCode: "ILLEGAL", message_bn: "সক্রিয় সাবস্ক্রিপশন নেই" };
  return { ok: true, state: { ...s, cancelAtPeriodEnd: cancel } };
}

/** Time-driven moves (scheduler). Applying it twice gives the same result. */
export function advance(s: SubState, now: number): SubState {
  let cur = s;
  for (let guard = 0; guard < 4; guard++) {
    const next = step(cur, now);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

function step(s: SubState, now: number): SubState {
  switch (s.status) {
    case "trialing":
      return s.trialEndsAt != null && now >= s.trialEndsAt ? { ...s, status: "expired", planCode: "free" } : s;
    case "active":
      if (s.currentPeriodEnd == null || now < s.currentPeriodEnd) return s;
      return s.cancelAtPeriodEnd ? { ...s, status: "expired", planCode: "free" } : { ...s, status: "past_due" };
    case "past_due":
      return { ...s, status: "grace", graceEndsAt: (s.currentPeriodEnd ?? now) + GRACE_MS };
    case "grace":
      return s.graceEndsAt != null && now >= s.graceEndsAt ? { ...s, status: "expired", planCode: "free" } : s;
    default:
      return s;
  }
}

/** Which plan's quotas apply right now. */
export function effectivePlan(s: SubState, now: number): "free" | "premium" {
  const a = advance(s, now);
  return a.status === "trialing" || a.status === "active" || a.status === "past_due" || a.status === "grace" ? "premium" : "free";
}

/** Ends within 24 h (and not cancelled) → "expiring soon" notification. */
export function expiringSoon(s: SubState, now: number): boolean {
  const end = s.status === "trialing" ? s.trialEndsAt : s.status === "active" ? s.currentPeriodEnd : s.status === "grace" ? s.graceEndsAt : null;
  return end != null && end > now && end - now <= EXPIRING_SOON_MS;
}
