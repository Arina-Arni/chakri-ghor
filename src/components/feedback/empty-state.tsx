import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon + message + next action, for data views with nothing to show. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
  className,
  headingLevel = 2,
}: {
  icon?: LucideIcon;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const H = `h${headingLevel}` as const;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden>
        <Icon className="size-7" />
      </span>
      <H className="text-lg font-semibold text-ink">{title}</H>
      {body && <div className="max-w-md text-muted-foreground">{body}</div>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
