"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock, Clock, Hourglass, Lock } from "lucide-react";
import { formatDateBn } from "@/domain/bn";
import { countdownLevel, getCountdown } from "@/domain/countdown";
import { useServerNow } from "@/domain/countdown/use-server-now";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const styles = {
  normal: "bg-muted text-ink",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  closed: "bg-muted text-muted-foreground",
} as const;

const icons = { normal: Clock, warning: Hourglass, danger: AlarmClock, closed: Lock } as const;

/**
 * Remaining time: normal, warning (< 48 h), danger (< 3 h), closed.
 * Uses server-corrected time. Screen readers hear it only when it crosses a threshold.
 */
export function CountdownBadge({ endAt, startAt, className, size = "default" }: { endAt: string; startAt?: string; className?: string; size?: "default" | "lg" }) {
  const now = useServerNow(15_000);
  const [announce, setAnnounce] = useState("");
  const prevLevel = useRef<string | null>(null);

  const cd = now == null ? null : getCountdown(endAt, now);
  const level = cd?.level ?? null;
  const upcoming = startAt && now != null && now < new Date(startAt).getTime();

  useEffect(() => {
    if (!level) return;
    if (prevLevel.current && prevLevel.current !== level) {
      const msg = level === "closed" ? t("jobCard.closed") : level === "danger" ? `${t("jobCard.left", { time: cd!.text })}` : "";
      const timer = setTimeout(() => setAnnounce(msg), 0);
      prevLevel.current = level;
      return () => clearTimeout(timer);
    }
    prevLevel.current = level;
  }, [level, cd]);

  if (!cd || !level) {
    return <span className={cn("inline-flex h-8 w-24 rounded-full bg-muted", className)} aria-hidden />;
  }
  const Icon = upcoming ? Clock : icons[level];
  const text = upcoming
    ? t("jobCard.startsOn", { date: formatDateBn(startAt!) })
    : level === "closed"
      ? t("jobCard.closed")
      : t("jobCard.left", { time: cd.text });
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-semibold tabular-nums",
          size === "lg" ? "px-3.5 py-1.5 text-base" : "px-2.5 py-1 text-sm",
          upcoming ? "bg-info-soft text-info" : styles[level],
        )}
      >
        <Icon className="size-4" aria-hidden />
        {text}
      </span>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </span>
  );
}

export { countdownLevel };
