import { AlertTriangle, CheckCircle2, Info, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  info: { box: "border-info/20 bg-info-soft text-info", Icon: Info },
  warning: { box: "border-warning/25 bg-warning-soft text-warning", Icon: AlertTriangle },
  danger: { box: "border-danger/20 bg-danger-soft text-danger", Icon: XCircle },
  success: { box: "border-success/20 bg-success-soft text-success", Icon: CheckCircle2 },
  ai: { box: "border-ai/20 bg-ai-soft text-ai", Icon: Sparkles },
} as const;

/** Inline banner. Color is never the only signal: every tone has an icon and text. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
  live,
}: {
  tone?: keyof typeof styles;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Announce politely when it appears. */
  live?: boolean;
}) {
  const { box, Icon } = styles[tone];
  return (
    <div
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", box, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-ink/90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
