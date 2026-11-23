import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatNumberBn, toBnDigits } from "@/domain/bn";
import { cn } from "@/lib/utils";

/** Number + label + optional trend. */
export function StatTile({
  value,
  label,
  icon: Icon,
  trend,
  tone = "default",
  className,
}: {
  value: number | string;
  label: string;
  icon?: LucideIcon;
  /** Percent change, e.g. 12 or -4. */
  trend?: number;
  tone?: "default" | "warning" | "danger" | "hero";
  className?: string;
}) {
  const hero = tone === "hero";
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-4",
        hero ? "border-white/15 bg-white/5 text-white" : "bg-surface shadow-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-2xl font-bold tabular-nums md:text-3xl",
            hero ? "text-white" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-ink",
          )}
        >
          {typeof value === "number" ? formatNumberBn(value) : value}
        </span>
        {Icon && <Icon className={cn("size-6", hero ? "text-white/70" : "text-primary")} aria-hidden />}
      </div>
      <span className={cn(hero ? "text-white/80" : "text-muted-foreground")}>{label}</span>
      {trend != null && (
        <span className={cn("inline-flex items-center gap-1 text-sm font-medium", trend >= 0 ? "text-success" : "text-danger")}>
          {trend >= 0 ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
          {trend >= 0 ? "+" : "−"}
          {toBnDigits(Math.abs(trend))}%
        </span>
      )}
    </div>
  );
}

/** Usage bar like "AI সার্চ ৭/১০ আজ". */
export function QuotaMeter({ label, used, limit, hint }: { label: string; used: number; limit: number; hint?: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-primary";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {toBnDigits(used)}/{toBnDigits(limit)} আজ
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-valuetext={`${toBnDigits(used)}/${toBnDigits(limit)}`}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full transition-[width] duration-200", tone)} style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
