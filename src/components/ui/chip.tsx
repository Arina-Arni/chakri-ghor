import { Sparkles, X } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Fully rounded chip; removable when `onRemove` is given. */
export function Chip({
  children,
  onRemove,
  selected,
  className,
  removeLabel,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  selected?: boolean;
  className?: string;
  removeLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium",
        selected ? "border-primary/30 bg-primary-soft text-primary-hover" : "border-border bg-surface text-ink",
        onRemove && "pr-1",
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 grid size-7 place-items-center rounded-full hover:bg-ink/10"
          aria-label={removeLabel ?? t("search.removeChip", { label: typeof children === "string" ? children : "" })}
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </span>
  );
}

/** Purple ✦ chip marking AI-generated content. */
export function AiChip({ children, onRemove, className, removeLabel }: { children: React.ReactNode; onRemove?: () => void; className?: string; removeLabel?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1 rounded-full border border-ai/25 bg-ai-soft px-3 py-1 text-sm font-medium text-ai",
        onRemove && "pr-1",
        className,
      )}
    >
      <Sparkles className="size-3.5" aria-hidden />
      <span className="sr-only">AI: </span>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 grid size-7 place-items-center rounded-full hover:bg-ai/15"
          aria-label={removeLabel ?? t("search.removeChip", { label: typeof children === "string" ? children : "" })}
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </span>
  );
}
