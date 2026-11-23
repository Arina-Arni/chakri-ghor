import { toBnDigits } from "@/domain/bn";

export const WARNING_MS = 48 * 60 * 60 * 1000;
export const DANGER_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CountdownLevel = "normal" | "warning" | "danger" | "closed";

export type Countdown = {
  msLeft: number;
  level: CountdownLevel;
  /** "২ দিন ৪ ঘণ্টা", "১১:৫৮", or "" when closed. */
  text: string;
};

export function countdownLevel(msLeft: number): CountdownLevel {
  if (msLeft <= 0) return "closed";
  if (msLeft < DANGER_MS) return "danger";
  if (msLeft < WARNING_MS) return "warning";
  return "normal";
}

/** Format remaining time: "২ দিন ৪ ঘণ্টা" from 24 h up, "১১:৫৮" (hh:mm) below 24 h. */
export function formatCountdownBn(msLeft: number): string {
  if (msLeft <= 0) return "";
  if (msLeft >= DAY_MS) {
    const days = Math.floor(msLeft / DAY_MS);
    const hours = Math.floor((msLeft % DAY_MS) / 3_600_000);
    return hours > 0
      ? `${toBnDigits(days)} দিন ${toBnDigits(hours)} ঘণ্টা`
      : `${toBnDigits(days)} দিন`;
  }
  const totalMinutes = Math.floor(msLeft / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return toBnDigits(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

export function getCountdown(endAt: string | Date | number, now: number): Countdown {
  const msLeft = new Date(endAt).getTime() - now;
  return { msLeft, level: countdownLevel(msLeft), text: formatCountdownBn(msLeft) };
}

/**
 * Screen readers should hear a countdown only when it crosses a threshold,
 * not every second. Returns true when `prev` → `next` moved to a new level.
 */
export function crossedThreshold(prevMsLeft: number, nextMsLeft: number): boolean {
  return countdownLevel(prevMsLeft) !== countdownLevel(nextMsLeft);
}

/** Offset between server and device clocks, set once per page load. */
let serverOffsetMs = 0;

export function setServerNow(serverNowMs: number, clientNowMs: number = Date.now()): void {
  serverOffsetMs = serverNowMs - clientNowMs;
}

export function getServerOffset(): number {
  return serverOffsetMs;
}

/** Current time corrected by the server offset. */
export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}
