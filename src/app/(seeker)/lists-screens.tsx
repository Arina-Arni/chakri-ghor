"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, BellOff, Bookmark, CheckCheck, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { JobCard } from "@/components/jobs/job-card";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { CardsSkeleton, JobListSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { useSession } from "@/components/providers/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { deleteSavedSearch, filterValueLabel, listBookmarks, listNotifications, listSavedSearches, markNotificationsRead, setSavedSearchAlert } from "@/data";
import { dhakaDateKey, formatDateBn, formatRelativeBn, toBnDigits } from "@/domain/bn";
import { serverNow } from "@/domain/countdown";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { filtersToParams } from "@/lib/job-filters";
import { cn } from "@/lib/utils";
import type { JobFilters, SavedSearch } from "@/types";

export function BookmarksScreen() {
  const q = useData(() => listBookmarks(), []);
  return (
    <div>
      <PageHeader title={t("bookmarks.title")} />
      {q.status === "loading" ? (
        <JobListSkeleton count={3} />
      ) : q.status === "error" ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : q.data.length === 0 ? (
        <EmptyState icon={Bookmark} title={t("bookmarks.emptyTitle")} body={t("bookmarks.emptyBody")} action={<Button asChild><Link href="/jobs">{t("nav.jobs")}</Link></Button>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {q.data.map((b) => (
            <li key={b.id}>
              <JobCard
                job={b.job}
                className="h-full"
                onBookmarkChange={(on) => {
                  if (!on) q.setData((xs) => xs.filter((x) => x.id !== b.id));
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function filterChips(f: JobFilters): string[] {
  const out: string[] = [];
  if (f.q) out.push(`“${f.q}”`);
  (["division", "district", "sector", "category", "organization", "education", "jobType", "workMode", "status"] as const).forEach((k) =>
    (f[k] as string[] | undefined)?.forEach((v) => out.push(filterValueLabel(k, v))),
  );
  if (f.salaryMin) out.push(filterValueLabel("salaryMin", String(f.salaryMin)));
  if (f.deadlineWithin) out.push(filterValueLabel("deadlineWithin", f.deadlineWithin));
  return out;
}

export function SavedSearchRow({ s, onChange, onDelete }: { s: SavedSearch; onChange: (s: SavedSearch) => void; onDelete: () => void }) {
  const [busy, setBusy] = useState(false);
  const id = `alert-${s.id}`;
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-card sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{s.name}</h2>
          {s.newMatchCount > 0 ? <Badge variant="success">{t("alerts.newMatches", { n: s.newMatchCount })}</Badge> : <span className="text-sm text-muted-foreground">{t("alerts.noNew")}</span>}
        </div>
        <ul className="flex flex-wrap gap-1.5">{filterChips(s.filters).map((c) => <li key={c}><Chip className="min-h-7 py-0.5">{c}</Chip></li>)}</ul>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          {s.alertEnabled ? <Bell className="size-4 text-primary" aria-hidden /> : <BellOff className="size-4 text-muted-foreground" aria-hidden />}
          {t("alerts.alertSwitch")}
        </label>
        <Switch
          id={id}
          checked={s.alertEnabled}
          disabled={busy}
          onCheckedChange={async (v) => {
            setBusy(true);
            const r = await setSavedSearchAlert(s.id, v, newIdempotencyKey());
            setBusy(false);
            if (r.ok) {
              onChange(r.data);
              toast.success(v ? t("alerts.alertOn") : t("alerts.alertOff"));
            } else toast.error(r.error.message_bn);
          }}
        />
        <Button asChild variant="secondary" size="sm">
          <Link href={`/jobs?${filtersToParams(s.filters)}`}><Search aria-hidden />{t("alerts.run")}</Link>
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`${t("common.delete")}: ${s.name}`}>
          <Trash2 aria-hidden />
        </Button>
      </div>
    </article>
  );
}

export function AlertsScreen() {
  const q = useData(() => listSavedSearches(), []);
  const [del, setDel] = useState<SavedSearch | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div>
      <PageHeader title={t("alerts.title")} />
      {q.status === "loading" ? (
        <CardsSkeleton count={3} />
      ) : q.status === "error" ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : q.data.length === 0 ? (
        <EmptyState icon={Bell} title={t("alerts.emptyTitle")} body={t("alerts.emptyBody")} action={<Button asChild><Link href="/jobs">{t("nav.jobs")}</Link></Button>} />
      ) : (
        <ul className="space-y-3">
          {q.data.map((s) => (
            <li key={s.id}>
              <SavedSearchRow s={s} onChange={(n) => q.setData((xs) => xs.map((x) => (x.id === n.id ? n : x)))} onDelete={() => setDel(s)} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        destructive
        pending={pending}
        title={t("common.delete")}
        description={del ? t("alerts.deleteConfirm", { name: del.name }) : ""}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          if (!del) return;
          setPending(true);
          const r = await deleteSavedSearch(del.id, newIdempotencyKey());
          setPending(false);
          if (r.ok) {
            q.setData((xs) => xs.filter((x) => x.id !== del.id));
            toast.success(t("alerts.deleted"));
          } else toast.error(r.error.message_bn);
          setDel(null);
        }}
      />
    </div>
  );
}

export function NotificationsScreen() {
  const q = useData(() => listNotifications(), []);
  const { refresh } = useSession();
  const [marking, setMarking] = useState(false);
  const today = dhakaDateKey(serverNow());
  const yesterday = dhakaDateKey(serverNow() - 86_400_000);
  const dayLabel = (k: string, iso: string) => (k === today ? t("notifications.today") : k === yesterday ? t("notifications.yesterday") : formatDateBn(iso));
  const unread = q.status === "success" ? q.data.filter((n) => !n.readAt).length : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("notifications.title")}
        description={unread ? `${toBnDigits(unread)}টি ${t("notifications.unread")}` : undefined}
        actions={
          unread > 0 && (
            <Button
              variant="secondary"
              loading={marking}
              onClick={async () => {
                setMarking(true);
                const r = await markNotificationsRead("all");
                setMarking(false);
                if (r.ok) {
                  q.setData((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? new Date(serverNow()).toISOString() })));
                  toast.success(t("notifications.markedRead"));
                  void refresh();
                }
              }}
            >
              <CheckCheck aria-hidden />
              {t("notifications.markAllRead")}
            </Button>
          )
        }
      />
      {q.status === "loading" ? (
        <CardsSkeleton count={3} />
      ) : q.status === "error" ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : q.data.length === 0 ? (
        <EmptyState icon={Bell} title={t("notifications.emptyTitle")} body={t("notifications.emptyBody")} />
      ) : (
        Object.entries(
          q.data.reduce<Record<string, typeof q.data>>((acc, n) => {
            const k = dhakaDateKey(n.createdAt);
            (acc[k] ??= []).push(n);
            return acc;
          }, {}),
        ).map(([k, items]) => (
          <section key={k} aria-labelledby={`d-${k}`} className="mb-6">
            <h2 id={`d-${k}`} className="mb-2 text-sm font-semibold text-muted-foreground">{dayLabel(k, items[0].createdAt)}</h2>
            <ul className="divide-y overflow-hidden rounded-xl border bg-surface">
              {items.map((n) => (
                <li key={n.id}>
                  <Link href={n.href ?? "#"} className={cn("flex gap-3 p-4 hover:bg-muted", !n.readAt && "bg-primary-soft/40")}>
                    <span className={cn("mt-2 size-2.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{!n.readAt && <span className="sr-only">{t("notifications.unread")}: </span>}{n.titleBn}</span>
                        <Badge size="sm" variant="outline">{t(`enums.notificationType.${n.type}`)}</Badge>
                      </span>
                      <span className="block text-muted-foreground">{n.bodyBn}</span>
                      <span className="text-sm text-muted-foreground">{formatRelativeBn(n.createdAt, serverNow())}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
