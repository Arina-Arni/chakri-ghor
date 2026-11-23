import { cn } from "@/lib/utils";

/** Surface card: border + very soft shadow, 12px radius. */
export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-xl border bg-surface p-4 shadow-card md:p-5", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  as: H = "h2",
  className,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <H id={id} className="text-lg font-semibold text-ink">
          {title}
        </H>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
