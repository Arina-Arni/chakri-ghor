import { Check } from "lucide-react";
import { toBnDigits } from "@/domain/bn";
import { cn } from "@/lib/utils";

/** Wizard steps. Completed steps can be links/buttons via `onStepClick`. */
export function Stepper({
  steps,
  current,
  onStepClick,
  maxReached,
  label,
}: {
  steps: readonly string[];
  /** 1-based */
  current: number;
  maxReached?: number;
  onStepClick?: (step: number) => void;
  label: string;
}) {
  return (
    <nav aria-label={label}>
      <ol className="flex items-start gap-2">
        {steps.map((s, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          const reachable = onStepClick && n <= (maxReached ?? current) && !active;
          const inner = (
            <>
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border-2 font-semibold tabular-nums",
                  done && "border-primary bg-primary text-white",
                  active && "border-primary bg-primary-soft text-primary-hover",
                  !done && !active && "border-input bg-surface text-muted-foreground",
                )}
              >
                {done ? <Check className="size-5" aria-hidden /> : toBnDigits(n)}
              </span>
              <span className={cn("hidden text-sm sm:block", active ? "font-semibold text-ink" : "text-muted-foreground")}>{s}</span>
            </>
          );
          return (
            <li key={s} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
              {reachable ? (
                <button type="button" onClick={() => onStepClick(n)} className="flex items-center gap-2 rounded-lg text-left">
                  {inner}
                  <span className="sr-only">{done ? " (সম্পন্ন)" : ""}</span>
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  {inner}
                  <span className="sr-only">{done ? " (সম্পন্ন)" : active ? " (বর্তমান ধাপ)" : ""}</span>
                </span>
              )}
              {n < steps.length && <span className={cn("h-0.5 flex-1 rounded", done ? "bg-primary" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type TimelineItem = {
  id: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  body?: React.ReactNode;
  tone?: "default" | "success" | "danger" | "warning" | "info" | "muted";
};

/** Vertical event/step timeline. */
export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  const tones = {
    default: "border-primary bg-primary-soft text-primary-hover",
    success: "border-success bg-success-soft text-success",
    danger: "border-danger bg-danger-soft text-danger",
    warning: "border-warning bg-warning-soft text-warning",
    info: "border-info bg-info-soft text-info",
    muted: "border-input bg-surface text-muted-foreground",
  };
  return (
    <ol className={cn("relative space-y-0", className)}>
      {items.map((it, i) => (
        <li key={it.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < items.length - 1 && <span className="absolute top-9 bottom-0 left-[17px] w-0.5 bg-border" aria-hidden />}
          <span className={cn("relative z-10 grid size-9 shrink-0 place-items-center rounded-full border-2", tones[it.tone ?? "default"])}>
            {it.icon}
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <div className="font-medium text-ink">{it.title}</div>
            {it.meta && <div className="text-sm text-muted-foreground">{it.meta}</div>}
            {it.body && <div className="mt-2">{it.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
