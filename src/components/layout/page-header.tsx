import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export type Crumb = { href?: string; label: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label={t("common.breadcrumb")} className={cn("text-sm", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="inline-flex min-h-8 items-center underline-offset-4 hover:text-primary hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="text-ink">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** One h1 per page, with optional description, breadcrumbs, back link and actions. */
export function PageHeader({
  title,
  description,
  actions,
  crumbs,
  back,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: Crumb[];
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("mb-6 space-y-2", className)}>
      {crumbs && <Breadcrumbs items={crumbs} />}
      {back && (
        <Link href={back.href} className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink md:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
