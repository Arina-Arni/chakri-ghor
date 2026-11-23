import { atsLabel } from "@/domain/ats";
import { toBnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Circular 0–100 score with a text label (চমৎকার / ভালো / উন্নতি দরকার). */
export function ScoreRing({
  score,
  size = 120,
  label,
  showLabel = true,
  className,
}: {
  score: number;
  size?: number;
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const level = atsLabel(score);
  const color = level === "excellent" ? "#15803d" : level === "good" ? "#0f766e" : "#b45309";
  const stroke = Math.max(6, size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const text = t(`enums.atsLabel.${level}`);
  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)}>
      <div
        role="img"
        aria-label={`${label ?? t("resume.score")}: ${toBnDigits(score)}/১০০ — ${text}`}
        className="relative"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-[stroke-dashoffset] duration-200"
          />
        </svg>
        <span
          className="absolute inset-0 grid place-items-center font-bold text-ink tabular-nums"
          style={{ fontSize: size / 3.6 }}
          aria-hidden
        >
          {toBnDigits(score)}
        </span>
      </div>
      {showLabel && (
        <span className="text-sm font-semibold" style={{ color }} aria-hidden>
          {text}
        </span>
      )}
    </div>
  );
}
