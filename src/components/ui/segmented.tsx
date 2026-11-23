"use client";

import { cn } from "@/lib/utils";

/** Segmented control (radio group semantics) for 2–5 options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "default",
  tone = "default",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
  className?: string;
  size?: "default" | "sm";
  tone?: "default" | "hero";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1", className)}
      onKeyDown={(e) => {
        const i = options.findIndex((o) => o.value === value);
        const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!delta) return;
        e.preventDefault();
        const next = options[(i + delta + options.length) % options.length];
        onChange(next.value);
        requestAnimationFrame(() =>
          (e.currentTarget.querySelector(`[data-value="${CSS.escape(next.value)}"]`) as HTMLElement | null)?.focus(),
        );
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-3 font-medium whitespace-nowrap transition-colors duration-150",
              size === "sm" ? "min-h-9 text-sm" : "min-h-10",
              active ? "bg-surface text-primary-hover shadow-card" : tone === "hero" ? "text-white hover:bg-white/10" : "text-muted-foreground hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
