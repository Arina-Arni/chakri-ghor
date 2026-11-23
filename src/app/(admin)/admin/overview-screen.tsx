"use client";

import { AlarmClock, ClipboardCheck, FileStack, Send, Users } from "lucide-react";
import { ErrorState } from "@/components/feedback/error-state";
import { StatTilesSkeleton, TableSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { BarListChart, DonutChart, LineTrendChart, StackedBarChart } from "@/components/ui/charts";
import { StatTile } from "@/components/ui/stat-tile";
import { getAdminDashboard } from "@/data";
import { formatNumberBn, toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { t } from "@/i18n";

const dayLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return toBnDigits(`${Number(d)}/${Number(m)}`);
};

function MiniTable({ title, rows }: { title: string; rows: { query: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <table className="w-full text-sm">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="py-2 font-medium">{t("admin.overview.query")}</th>
            <th scope="col" className="py-2 text-right font-medium">{t("admin.overview.count")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.query} className="border-b last:border-0">
              <td className="py-2">{r.query}</td>
              <td className="py-2 text-right tabular-nums">{formatNumberBn(r.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function OverviewScreen() {
  const q = useData(() => getAdminDashboard(), []);
  return (
    <div>
      <PageHeader title={t("admin.overview.title")} />
      {q.status === "loading" ? (
        <div className="space-y-6"><StatTilesSkeleton count={5} /><TableSkeleton /></div>
      ) : q.status === "error" ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatTile value={q.data.openCirculars} label={t("admin.overview.openCirculars")} icon={FileStack} />
            <StatTile value={q.data.openVacancies} label={t("admin.overview.openVacancies")} icon={Users} />
            <StatTile value={q.data.closingToday} label={t("admin.overview.closingToday")} icon={AlarmClock} tone="warning" />
            <StatTile value={q.data.publishedToday} label={t("admin.overview.publishedToday")} icon={Send} trend={12} />
            <StatTile value={q.data.reviewPending} label={t("admin.overview.reviewPending")} icon={ClipboardCheck} tone={q.data.reviewPending ? "danger" : "default"} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <BarListChart title={t("admin.overview.byCategory")} data={q.data.byCategory} />
            <BarListChart title={t("admin.overview.byDivision")} data={q.data.byDivision} />
            <StackedBarChart
              title={t("admin.overview.runs7d")}
              xKey="label"
              data={q.data.workflowRuns7d.map((r) => ({ ...r, label: dayLabel(r.date) }))}
              series={[
                { key: "succeeded", label: t("admin.overview.succeeded") },
                { key: "failed", label: t("admin.overview.failed") },
                { key: "waiting", label: t("admin.overview.waiting") },
              ]}
            />
            <DonutChart title={t("admin.overview.aiOutcomes")} data={q.data.aiOutcomes} />
            <LineTrendChart title={t("admin.overview.signups")} xKey="label" yKey="count" yLabel={t("admin.overview.count")} data={q.data.signupsPerDay.map((r) => ({ ...r, label: dayLabel(r.date) }))} />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <MiniTable title={t("admin.overview.topSearches")} rows={q.data.topSearches} />
              <MiniTable title={t("admin.overview.zeroSearches")} rows={q.data.zeroResultSearches} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
