import type { DisplayStatus } from "@/types";

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

export { CIRCULAR_ACTIONS as CIRCULAR_TRANSITIONS, allowedCircularActions } from "@/domain/state-machines/circular";

export function isOpenForApplication(status: DisplayStatus): boolean {
  return status === "open" || status === "closing_soon";
}
