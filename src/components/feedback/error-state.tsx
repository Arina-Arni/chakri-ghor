"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/types";

/** Bangla message + retry + reference id. Never shows raw errors. */
export function ErrorState({
  error,
  onRetry,
  title = t("states.errorTitle"),
  className,
  compact = false,
}: {
  error?: ApiError | null;
  onRetry?: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-danger/20 bg-danger-soft/40 text-center",
        compact ? "px-4 py-5" : "px-6 py-10",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-danger-soft text-danger" aria-hidden>
        <AlertTriangle className="size-6" />
      </span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-muted-foreground">{error?.message_bn ?? t("states.errorBody")}</p>
      {error?.requestId && (
        <p className="text-sm text-muted-foreground">
          {t("common.reference", { id: "" })}
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-ink" lang="en">
            {error.requestId}
          </code>
        </p>
      )}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RotateCw aria-hidden />
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
