import type { CircularAction, CircularStatus, DisplayStatus } from "@/types";

export const CLOSING_SOON_MS = 48 * 60 * 60 * 1000;

type Dated = { startAt: string | Date; endAt: string | Date };

/**
 * Seeker-facing status derived only from dates:
 * upcoming (now < start) → open → closing_soon (≤ 48 h left) → closed (now ≥ end).
 */
export function displayStatus(circular: Dated, now: Date | number = Date.now()): DisplayStatus {
  const t = typeof now === "number" ? now : now.getTime();
  const start = new Date(circular.startAt).getTime();
  const end = new Date(circular.endAt).getTime();
  if (t >= end) return "closed";
  if (t < start) return "upcoming";
  if (end - t <= CLOSING_SOON_MS) return "closing_soon";
  return "open";
}

/** Moderation actions and the record statuses they are valid from. */
export const CIRCULAR_TRANSITIONS: Record<CircularAction, { from: CircularStatus[]; to: CircularStatus | null }> = {
  submit_review: { from: ["draft", "rejected"], to: "in_review" },
  approve: { from: ["in_review"], to: "published" },
  reject: { from: ["in_review"], to: "rejected" },
  extend: { from: ["published"], to: null },
  cancel: { from: ["draft", "published"], to: "cancelled" },
  archive: { from: ["published", "rejected", "cancelled"], to: "archived" },
};

/** Row actions to show for a circular in its current status. */
export function allowedCircularActions(status: CircularStatus): CircularAction[] {
  return (Object.keys(CIRCULAR_TRANSITIONS) as CircularAction[]).filter((a) =>
    CIRCULAR_TRANSITIONS[a].from.includes(status),
  );
}

export function isOpenForApplication(status: DisplayStatus): boolean {
  return status === "open" || status === "closing_soon";
}
