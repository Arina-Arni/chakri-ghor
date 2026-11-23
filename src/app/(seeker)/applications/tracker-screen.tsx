"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { KanbanSquare, LayoutList } from "lucide-react";
import { toast } from "sonner";
import { ConflictDialog } from "@/components/feedback/conflict-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Notice } from "@/components/feedback/notice";
import { CardsSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { ApplicationCard } from "@/components/tracker/application-card";
import { ApplicationDrawer } from "@/components/tracker/application-drawer";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteApplication, listApplications, updateApplication, updateApplicationStatus } from "@/data";
import { serverNow } from "@/domain/countdown";
import { toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { APPLICATION_STATUSES, type Application, type ApplicationPatch, type ApplicationStatus } from "@/types";

export function TrackerScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = sp.get("view") === "list" ? "list" : "board";
  const filter = (sp.get("status") ?? "all") as ApplicationStatus | "all";
  const openId = sp.get("open");
  const q = useData(() => listApplications(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v == null) p.delete(k);
    else p.set(k, v);
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  if (q.status === "loading") return (<><PageHeader title={t("tracker.title")} /><CardsSkeleton count={6} /></>);
  if (q.status === "error") return (<><PageHeader title={t("tracker.title")} /><ErrorState error={q.error} onRetry={q.reload} /></>);

  const apps = q.data;
  const replace = (a: Application) => q.setData((xs) => xs.map((x) => (x.id === a.id ? a : x)));
  const fail = (code: string, msg: string, ref?: string) => {
    if (code === "CONFLICT") setConflict(true);
    else toast.error(msg, { description: ref ? `রেফারেন্স: ${ref}` : undefined });
  };

  const changeStatus = async (a: Application, to: ApplicationStatus) => {
    if (a.status === to) return;
    setBusyId(a.id);
    const r = await updateApplicationStatus(a.id, to, a.version, newIdempotencyKey());
    setBusyId(null);
    if (r.ok) {
      replace(r.data);
      toast.success(t("tracker.statusChanged", { status: t(`enums.applicationStatus.${to}`) }));
    } else fail(r.error.code, r.error.message_bn, r.error.requestId);
  };

  const now = serverNow();
  const urgent = apps.filter((a) => ["saved", "preparing"].includes(a.status) && new Date(a.deadlineAt).getTime() - now > 0 && new Date(a.deadlineAt).getTime() - now < 86_400_000).length;
  const visible = filter === "all" ? apps : apps.filter((a) => a.status === filter);
  const current = apps.find((a) => a.id === openId) ?? null;

  return (
    <div>
      <PageHeader
        title={t("tracker.title")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={t("tracker.viewLabel")}
              value={view}
              onChange={(v) => setParam("view", v === "board" ? null : v)}
              options={[
                { value: "list", label: <><LayoutList className="size-4" aria-hidden />{t("tracker.viewList")}</> },
                { value: "board", label: <><KanbanSquare className="size-4" aria-hidden />{t("tracker.viewBoard")}</> },
              ]}
            />
            <Select value={filter} onValueChange={(v) => setParam("status", v === "all" ? null : v)}>
              <SelectTrigger aria-label={t("tracker.statusFilter")} className="min-w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tracker.allStatuses")}</SelectItem>
                {APPLICATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`enums.applicationStatus.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />
      {urgent > 0 && (
        <Notice tone="danger" className="mb-4" title={t("tracker.strip", { n: urgent })} />
      )}

      {apps.length === 0 ? (
        <EmptyState icon={KanbanSquare} title={t("tracker.emptyTitle")} body={t("tracker.emptyBody")} action={<Button asChild><Link href="/jobs">{t("nav.jobs")}</Link></Button>} />
      ) : view === "board" ? (
        <>
          <p className="mb-2 text-sm text-muted-foreground lg:hidden">{t("tracker.boardHint")}</p>
          <div tabIndex={0} role="region" aria-label={t("tracker.viewBoard")} className="scrollbar-thin -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4">
            {(filter === "all" ? APPLICATION_STATUSES : [filter]).map((s) => {
              const col = apps.filter((a) => a.status === s);
              return (
                <section key={s} aria-labelledby={`col-${s}`} className="w-72 shrink-0 snap-start rounded-xl bg-muted/70 p-3">
                  <h2 id={`col-${s}`} className="mb-3 flex items-center justify-between font-semibold">
                    {t(`enums.applicationStatus.${s}`)}
                    <span className="rounded-full bg-surface px-2 text-sm tabular-nums">{toBnDigits(col.length)}</span>
                  </h2>
                  {col.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("tracker.emptyColumn")}</p>
                  ) : (
                    <ul className="space-y-3">
                      {col.map((a) => (
                        <li key={a.id}>
                          <ApplicationCard app={a} busy={busyId === a.id} onOpen={() => setParam("open", a.id)} onStatus={(to) => void changeStatus(a, to)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : visible.length === 0 ? (
        <EmptyState title={t("tracker.emptyColumn")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => (
            <li key={a.id}>
              <ApplicationCard app={a} busy={busyId === a.id} onOpen={() => setParam("open", a.id)} onStatus={(to) => void changeStatus(a, to)} className="h-full" />
            </li>
          ))}
        </ul>
      )}

      <ApplicationDrawer
        app={current}
        open={!!current}
        onOpenChange={(o) => !o && setParam("open", null)}
        saving={saving}
        onSave={async (patch: ApplicationPatch) => {
          if (!current) return;
          setSaving(true);
          const r = await updateApplication(current.id, patch, current.version, newIdempotencyKey());
          setSaving(false);
          if (r.ok) {
            replace(r.data);
            toast.success(t("tracker.updated"));
          } else fail(r.error.code, r.error.message_bn, r.error.requestId);
        }}
        onWithdraw={async () => {
          if (current) await changeStatus(current, "withdrawn");
        }}
        onDelete={async () => {
          if (!current) return;
          const r = await deleteApplication(current.id, newIdempotencyKey());
          if (r.ok) {
            q.setData((xs) => xs.filter((x) => x.id !== current.id));
            setParam("open", null);
            toast.success(t("tracker.deleted"));
          } else fail(r.error.code, r.error.message_bn, r.error.requestId);
        }}
      />
      <ConflictDialog open={conflict} onOpenChange={setConflict} onReload={() => { setConflict(false); void q.reload(); }} changes={[{ field: t("tracker.title"), yours: t("states.conflictYours"), theirs: t("states.conflictTheirs") }]} />
    </div>
  );
}
