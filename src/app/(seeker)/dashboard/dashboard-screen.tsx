"use client";

import Link from "next/link";
import { Bookmark, CalendarCheck, CalendarClock, Send, Sparkles } from "lucide-react";
import { JobCard } from "@/components/jobs/job-card";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { JobListSkeleton, StatTilesSkeleton } from "@/components/feedback/skeletons";
import { CompletenessRing } from "@/components/profile/profile-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { BarListChart } from "@/components/ui/charts";
import { StatTile } from "@/components/ui/stat-tile";
import { getSeekerDashboard } from "@/data";
import { formatDateTimeBn } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { t } from "@/i18n";
import { filtersToParams } from "@/lib/job-filters";

export function DashboardScreen() {
  const q = useData(() => getSeekerDashboard(), []);
  if (q.status === "loading")
    return (
      <div className="space-y-6">
        <StatTilesSkeleton count={3} />
        <JobListSkeleton count={2} compact />
      </div>
    );
  if (q.status === "error") return <ErrorState error={q.error} onRetry={q.reload} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{t("dashboard.greeting", { name: d.greetingName })}</h1>
        <p className="text-muted-foreground">{t("dashboard.greetingSub")}</p>
      </div>

      {d.profileCompleteness < 100 && (
        <Card className="flex flex-col gap-4 border-primary/30 bg-primary-soft/40 sm:flex-row sm:items-center">
          <CompletenessRing pct={d.profileCompleteness} size={80} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t("dashboard.completenessTitle", { pct: d.profileCompleteness })}</h2>
            <p className="text-muted-foreground">{t("dashboard.completenessBody")} {d.missingItems.length > 0 && `${t("profile.missing")} ${d.missingItems.join(", ")}`}</p>
          </div>
          <Button asChild><Link href="/profile">{t("dashboard.completenessCta")}</Link></Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile value={d.stats.saved} label={t("dashboard.statSaved")} icon={Bookmark} />
        <StatTile value={d.stats.applied} label={t("dashboard.statApplied")} icon={Send} />
        <StatTile value={d.stats.upcomingExams} label={t("dashboard.statExams")} icon={CalendarCheck} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="week-h">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="week-h" className="text-xl font-semibold">{t("dashboard.closingWeek")}</h2>
              <Link href="/bookmarks" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">{t("common.seeAll")}</Link>
            </div>
            {d.closingThisWeek.length === 0 ? (
              <EmptyState icon={CalendarClock} title={t("dashboard.closingWeekEmpty")} headingLevel={3} />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">{d.closingThisWeek.map((j) => <li key={j.id}><JobCard job={j} variant="compact" className="h-full" /></li>)}</ul>
            )}
          </section>
          <section aria-labelledby="rec-h">
            <h2 id="rec-h" className="mb-3 flex items-center gap-2 text-xl font-semibold"><Sparkles className="size-5 text-ai" aria-hidden />{t("dashboard.recommended")}</h2>
            {d.recommended.length === 0 ? (
              <EmptyState title={t("states.emptyTitle")} headingLevel={3} action={<Button asChild variant="secondary"><Link href="/profile">{t("dashboard.completenessCta")}</Link></Button>} />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">{d.recommended.map((j) => <li key={j.id}><JobCard job={j} variant="compact" reasons={j.reasonsBn} className="h-full" /></li>)}</ul>
            )}
          </section>
        </div>
        <div className="space-y-6">
          <Card aria-labelledby="exam-h">
            <CardHeader id="exam-h" title={t("dashboard.exams")} />
            {d.upcomingExams.length === 0 ? (
              <p className="text-muted-foreground">{t("dashboard.examsEmpty")}</p>
            ) : (
              <ul className="space-y-3">
                {d.upcomingExams.map((e) => (
                  <li key={e.applicationId}>
                    <Link href={`/applications?open=${e.applicationId}`} className="block rounded-lg border p-3 hover:border-primary">
                      <p className="font-medium">{e.jobTitleBn}</p>
                      <p className="text-sm text-warning">{formatDateTimeBn(e.examAt)}</p>
                      {e.venue && <p className="text-sm text-muted-foreground">{e.venue}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <BarListChart title={t("dashboard.byStatus")} data={d.applicationsByStatus} />
          <Card aria-labelledby="ss-h">
            <CardHeader id="ss-h" title={t("dashboard.savedSearches")} action={<Link href="/alerts" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">{t("common.seeAll")}</Link>} />
            <ul className="space-y-2">
              {d.savedSearches.map((s) => (
                <li key={s.id}>
                  <Link href={`/jobs?${filtersToParams(s.filters)}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 hover:bg-muted">
                    <span>{s.name}</span>
                    {s.newMatchCount > 0 && <Badge variant="success" size="sm">{t("alerts.newMatches", { n: s.newMatchCount })}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
