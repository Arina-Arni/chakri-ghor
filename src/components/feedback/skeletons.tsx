import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Wrapper that tells assistive tech something is loading. */
export function LoadingRegion({ children, className, label = t("common.loading") }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function JobCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="mt-4 h-5 w-4/5" />
      {!compact && <Skeleton className="mt-2 h-5 w-3/5" />}
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
    </div>
  );
}

export function JobListSkeleton({ count = 4, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <LoadingRegion className="grid gap-4">
      {Array.from({ length: count }, (_, i) => (
        <JobCardSkeleton key={i} compact={compact} />
      ))}
    </LoadingRegion>
  );
}

export function StatTilesSkeleton({ count = 3, className, tileClassName }: { count?: number; className?: string; tileClassName?: string }) {
  return (
    <LoadingRegion className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn("rounded-xl border bg-surface p-4", tileClassName)}>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <LoadingRegion className="overflow-hidden rounded-xl border bg-surface">
      <div className="border-b bg-muted/50 p-3">
        <Skeleton className="h-4 w-1/3" />
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b p-3 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-1/3" : "w-1/6")} />
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}

export function DetailSkeleton() {
  return (
    <LoadingRegion className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="hidden h-96 rounded-xl lg:block" />
    </LoadingRegion>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <LoadingRegion className="space-y-5 rounded-xl border bg-surface p-5">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function PageSkeleton() {
  return (
    <div className="container-page py-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      <div className="mt-8">
        <JobListSkeleton count={3} />
      </div>
    </div>
  );
}

export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <LoadingRegion className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
      ))}
    </LoadingRegion>
  );
}
