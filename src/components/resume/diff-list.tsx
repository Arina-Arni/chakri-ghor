"use client";

import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { ResumeChange } from "@/types";

/** Before/after rows with Accept / Reject. */
export function DiffList({ changes, onDecide, pendingId }: { changes: ResumeChange[]; onDecide: (id: string, accept: boolean) => void; pendingId: string | null }) {
  return (
    <ol className="space-y-3">
      {changes.map((c, i) => (
        <li key={c.id} className="rounded-xl border bg-surface p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              #{i + 1} · <span lang="en">{c.section}</span>
            </p>
            {c.status !== "pending" && (
              <Badge size="sm" variant={c.status === "accepted" ? "success" : "neutral"}>
                {c.status === "accepted" ? <Check aria-hidden /> : <X aria-hidden />}
                {c.status === "accepted" ? t("resume.accepted") : t("resume.rejected")}
              </Badge>
            )}
          </div>
          <p className="mb-2 text-sm text-muted-foreground">{c.reasonBn}</p>
          <div className="grid gap-2 text-sm" lang="en">
            <div className="rounded-lg border border-danger/20 bg-danger-soft/40 p-2">
              <p className="mb-0.5 text-xs font-semibold text-danger" lang="bn">− {t("resume.before")}</p>
              <p className="text-ink/80 line-through decoration-danger/40">{c.before}</p>
            </div>
            <div className="rounded-lg border border-success/20 bg-success-soft/40 p-2">
              <p className="mb-0.5 text-xs font-semibold text-success" lang="bn">+ {t("resume.after")}</p>
              <p className="text-ink">{c.after}</p>
            </div>
          </div>
          {c.status === "pending" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" loading={pendingId === `${c.id}:1`} disabled={pendingId != null} onClick={() => onDecide(c.id, true)}>
                <Check aria-hidden />
                {t("resume.accept")}
              </Button>
              <Button size="sm" variant="secondary" loading={pendingId === `${c.id}:0`} disabled={pendingId != null} onClick={() => onDecide(c.id, false)}>
                <X aria-hidden />
                {t("resume.reject")}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
