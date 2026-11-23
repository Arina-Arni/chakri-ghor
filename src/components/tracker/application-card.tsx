"use client";

import { CalendarCheck, Lightbulb } from "lucide-react";
import { CountdownBadge } from "@/components/jobs/countdown-badge";
import { OrgAvatar } from "@/components/jobs/org-avatar";
import { formatDateTimeBn } from "@/domain/bn";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";
import { StatusSelect } from "./status-select";

const AFTER_DEADLINE: ApplicationStatus[] = ["admit_card", "exam", "viva", "selected", "rejected", "withdrawn"];

export function ApplicationCard({
  app,
  onOpen,
  onStatus,
  busy,
  className,
}: {
  app: Application;
  onOpen: () => void;
  onStatus: (s: ApplicationStatus) => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <article className={cn("relative space-y-2 rounded-xl border bg-surface p-3 shadow-card hover:border-primary/50", busy && "opacity-60", className)} aria-busy={busy}>
      <div className="flex items-center gap-2">
        <OrgAvatar shortName={app.organizationShortName} seed={app.organizationShortName} size="sm" />
        <p className="min-w-0 truncate text-sm text-muted-foreground">{app.organizationNameBn}</p>
      </div>
      <h3 className="leading-snug font-semibold">
        <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 after:content-[''] hover:underline">
          {app.jobTitleBn}
        </button>
      </h3>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {app.examAt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 font-medium text-warning">
            <CalendarCheck className="size-4" aria-hidden />
            {t("tracker.exam", { date: formatDateTimeBn(app.examAt) })}
          </span>
        ) : (
          !AFTER_DEADLINE.includes(app.status) && <CountdownBadge endAt={app.deadlineAt} />
        )}
      </div>
      <p className="text-sm text-muted-foreground">{app.applicantRef ? t("tracker.ref", { ref: app.applicantRef }) : t("tracker.noRef")}</p>
      {app.nextActionBn && (
        <p className="flex items-start gap-1.5 text-sm text-ink">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {app.nextActionBn}
        </p>
      )}
      <StatusSelect value={app.status} onChange={onStatus} disabled={busy} label={t("tracker.changeStatusFor", { title: app.jobTitleBn })} />
    </article>
  );
}
