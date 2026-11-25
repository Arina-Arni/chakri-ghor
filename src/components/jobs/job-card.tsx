"use client";

import Link from "next/link";
import { BadgeCheck, MapPin, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBn, formatRelativeBn, formatSalaryRangeBn, toBnDigits } from "@/domain/bn";
import { displayStatus } from "@/domain/status";
import { useServerNow } from "@/domain/countdown/use-server-now";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { CircularListItem } from "@/types";
import { BookmarkButton } from "./bookmark-button";
import { CountdownBadge } from "./countdown-badge";
import { OrgAvatar } from "./org-avatar";

/**
 * Job card (spec §4.4). The title link covers the whole card through a pseudo-element,
 * so there are no nested interactive elements; the bookmark button sits above it.
 */
export function JobCard({
  job,
  variant = "default",
  reasons,
  headingLevel = 3,
  onBookmarkChange,
  className,
}: {
  job: CircularListItem;
  variant?: "default" | "compact";
  reasons?: string[];
  headingLevel?: 2 | 3;
  onBookmarkChange?: (b: boolean) => void;
  className?: string;
}) {
  const now = useServerNow(60_000);
  const closed = now != null && displayStatus(job, now) === "closed";
  const H = `h${headingLevel}` as const;
  const salary = formatSalaryRangeBn(job.salaryMin, job.salaryMax) ?? t("jobCard.salaryNA");
  const compact = variant === "compact";

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-card transition-[box-shadow,border-color] duration-150 focus-within:border-primary hover:border-primary/40 hover:shadow-raised",
        closed && "bg-muted/40",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <OrgAvatar shortName={job.organization.shortName} seed={job.organization.slug} size={compact ? "sm" : "md"} />
        {/* relative: keeps the absolutely positioned sr-only "verified" text inside the clipped
            line; otherwise a long organization name pushes it past the screen edge on phones. */}
        <p className={cn("relative min-w-0 flex-1 truncate text-sm", closed ? "text-muted-foreground" : "text-ink")}>
          {job.organization.nameBn}
          {job.organization.verified && (
            <span className="ml-1 inline-flex items-center align-middle text-primary">
              <BadgeCheck className="size-4" aria-hidden />
              <span className="sr-only">{t("jobCard.verified")}</span>
            </span>
          )}
        </p>
        {closed ? (
          <Badge variant="neutral" size="sm">
            {t("jobCard.closed")}
          </Badge>
        ) : (
          job.originalEndAt && (
            <Badge variant="info" size="sm">
              {t("jobCard.extended")}
            </Badge>
          )
        )}
      </div>

      <H className={cn("leading-snug font-semibold", compact ? "text-base" : "text-lg", closed ? "text-muted-foreground" : "text-ink")}>
        <Link href={`/jobs/${job.slug}`} className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:underline hover:underline">
          {job.titleBn}
        </Link>
      </H>

      {!compact && (
        <ul className="flex flex-wrap gap-1.5" aria-label="ট্যাগ">
          <li>
            <Badge variant="primary" size="sm">
              {t(`enums.sector.${job.sector}`)}
            </Badge>
          </li>
          <li>
            <Badge variant="outline" size="sm">
              {t(`enums.applyPlatform.${job.applyPlatform}`)}
            </Badge>
          </li>
          {job.aiTags.slice(0, 2).map((tag) => (
            <li key={tag}>
              <Badge variant="ai" size="sm">
                <Sparkles aria-hidden />
                <span className="sr-only">{t("jobCard.aiTag")}: </span>
                {tag}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {reasons && reasons.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="কেন প্রস্তাবিত">
          {reasons.map((r) => (
            <li key={r}>
              <Badge variant="success" size="sm">
                {r}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          {t(`enums.jobType.${job.jobType}`)} · {t(`enums.workMode.${job.workMode}`)}
          {job.publishedAt && now != null && <> · {formatRelativeBn(job.publishedAt, now)}</>}
          {" · "}
          {t("jobCard.posts", { n: job.totalVacancies })}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {/* No single district: "anywhere in Bangladesh" or several places (details on the job page). */}
            {job.districtNameBn ?? t("jobCard.variousPlaces")}
          </span>
          <span className={cn(salary === t("jobCard.salaryNA") ? "italic" : "font-medium text-ink")}>{salary}</span>
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="flex flex-col gap-1">
          {!compact && (
            <span className="text-sm text-muted-foreground">
              {t("jobCard.deadline", { date: formatDateTimeBn(job.endAt) })}
            </span>
          )}
          <CountdownBadge endAt={job.endAt} startAt={job.startAt} />
        </div>
        <div className="flex items-center gap-1">
          <BookmarkButton postId={job.primaryPostId} title={job.titleBn} initial={job.bookmarked} onChange={onBookmarkChange} />
          {!compact && (
            <span className="hidden text-sm font-medium text-primary sm:inline" aria-hidden>
              {t("common.seeDetails")} →
            </span>
          )}
        </div>
      </div>
      {job.postCount > 1 && <span className="sr-only">{toBnDigits(job.postCount)}টি পদের সার্কুলার</span>}
    </article>
  );
}
