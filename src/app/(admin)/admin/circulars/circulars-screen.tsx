"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, History, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { type Column, DataTable } from "@/components/admin/data-table";
import { CircularStatusBadge } from "@/components/admin/status-badges";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ConflictDialog } from "@/components/feedback/conflict-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Timeline } from "@/components/ui/stepper";
import { getCircularRevisions, listAdminCirculars, transitionCircular } from "@/data";
import { formatDateTimeBn, formatRelativeBn, toBnDigits } from "@/domain/bn";
import { allowedCircularActions } from "@/domain/status";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { extendDeadlineSchema } from "@/schemas/circular";
import type { AdminCircularRow, CircularAction, CircularStatus } from "@/types";

const STATUSES: CircularStatus[] = ["draft", "in_review", "published", "rejected", "cancelled", "archived"];

function RevisionDrawer({ row, onClose }: { row: AdminCircularRow | null; onClose: () => void }) {
  const q = useData(() => (row ? getCircularRevisions(row.id) : Promise.resolve({ ok: true as const, data: [] })), [row?.id]);
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("admin.circulars.history")}</SheetTitle>
          <SheetDescription>{row?.titleBn}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {q.status === "loading" ? <p role="status">{t("common.loading")}</p> : q.status === "success" && q.data.length === 0 ? <p>{t("admin.circulars.historyEmpty")}</p> : q.status === "success" && (
            <Timeline
              items={q.data.map((r) => ({
                id: r.id,
                icon: <History className="size-4" aria-hidden />,
                title: r.actorName,
                meta: formatDateTimeBn(r.at),
                body: (
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t("admin.circulars.history")}</caption>
                    <thead><tr className="text-left text-muted-foreground"><th scope="col">{t("admin.circulars.field")}</th><th scope="col">{t("admin.audit.before")}</th><th scope="col">{t("admin.audit.after")}</th></tr></thead>
                    <tbody>
                      {r.changes.map((c, i) => (
                        <tr key={i} className="border-t align-top">
                          <td className="py-1 pr-2 font-medium">{c.field}</td>
                          <td className="py-1 pr-2 text-danger line-through decoration-danger/40">{c.before}</td>
                          <td className="py-1 text-success">{c.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              }))}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function CircularsScreen() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CircularStatus | "all">("all");
  const q = useData(() => listAdminCirculars({ q: search, status }), [search, status]);
  const [action, setAction] = useState<{ row: AdminCircularRow; action: CircularAction } | null>(null);
  const [reason, setReason] = useState("");
  const [newEnd, setNewEnd] = useState({ date: "", time: "17:00" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [history, setHistory] = useState<AdminCircularRow | null>(null);

  const close = () => {
    setAction(null);
    setReason("");
    setFieldError(null);
    setNewEnd({ date: "", time: "17:00" });
  };

  const run = async () => {
    if (!action) return;
    const payload: { reason?: string; newEndAt?: string } = {};
    if (action.action === "reject") {
      if (reason.trim().length < 5) return setFieldError(t("validation.reasonRequired"));
      payload.reason = reason.trim();
    }
    if (action.action === "extend") {
      const parsed = extendDeadlineSchema(action.row.endAt).safeParse({ newEnd });
      if (!parsed.success) return setFieldError(parsed.error.issues[0].message);
      payload.newEndAt = parsed.data.newEnd;
    }
    setPending(true);
    const r = await transitionCircular(action.row.id, action.action, payload, action.row.version, newIdempotencyKey());
    setPending(false);
    if (r.ok) {
      q.setData((rows) => rows.map((x) => (x.id === r.data.id ? r.data : x)));
      toast.success(t("admin.circulars.actionDone", { action: t(`enums.circularAction.${action.action}`) }));
      close();
    } else if (r.error.code === "CONFLICT") {
      close();
      setConflict(true);
    } else if (r.error.fields) setFieldError(Object.values(r.error.fields)[0]);
    else toast.error(r.error.message_bn, { description: r.error.requestId });
  };

  const columns: Column<AdminCircularRow>[] = [
    { id: "title", header: t("admin.circulars.colTitle"), primary: true, hideable: false, sortValue: (r) => r.titleBn, cell: (r) => <Link href={`/jobs/${r.slug}`} className="font-medium text-ink hover:text-primary hover:underline">{r.titleBn}</Link>, className: "min-w-64" },
    { id: "org", header: t("admin.circulars.colOrg"), sortValue: (r) => r.organizationNameBn, cell: (r) => r.organizationNameBn },
    { id: "status", header: t("admin.circulars.colStatus"), sortValue: (r) => r.status, cell: (r) => <CircularStatusBadge status={r.status} /> },
    { id: "deadline", header: t("admin.circulars.colDeadline"), sortValue: (r) => r.endAt, cell: (r) => <span className="whitespace-nowrap">{formatDateTimeBn(r.endAt)}</span> },
    { id: "posts", header: t("admin.circulars.colPosts"), sortValue: (r) => r.postCount, cell: (r) => <span className="tabular-nums">{toBnDigits(r.postCount)}</span> },
    { id: "source", header: t("admin.circulars.colSource"), sortValue: (r) => r.source, cell: (r) => t(`enums.ingestSource.${r.source}`) },
    { id: "updated", header: t("admin.circulars.colUpdated"), sortValue: (r) => r.updatedAt, cell: (r) => <span className="whitespace-nowrap text-muted-foreground">{formatRelativeBn(r.updatedAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title={t("admin.circulars.title")} actions={<Button asChild><Link href="/admin/circulars/new"><Plus aria-hidden />{t("admin.circulars.new")}</Link></Button>} />
      <DataTable
        caption={t("admin.circulars.title")}
        columns={columns}
        rows={q.data}
        rowKey={(r) => r.id}
        status={q.status}
        error={q.error}
        onRetry={q.reload}
        initialSort={{ id: "updated", dir: "desc" }}
        empty={<EmptyState title={t("admin.circulars.empty")} />}
        toolbar={
          <>
            <div className="w-full sm:w-72">
              <label htmlFor="c-search" className="text-sm text-muted-foreground">{t("common.search")}</label>
              <Input id="c-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.circulars.search")} />
            </div>
            <div>
              <label htmlFor="c-status" className="block text-sm text-muted-foreground">{t("common.status")}</label>
              <Select value={status} onValueChange={(v) => setStatus(v as CircularStatus | "all")}>
                <SelectTrigger id="c-status" className="min-w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`enums.circularStatus.${s}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        }
        rowActions={(r) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`${t("common.actions")}: ${r.titleBn}`}><MoreHorizontal aria-hidden /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><Link href={`/jobs/${r.slug}`}><Eye className="size-4" aria-hidden />{t("common.view")}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href={`/admin/circulars/${r.id}/edit`}><Pencil className="size-4" aria-hidden />{t("common.edit")}</Link></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setHistory(r)}><History className="size-4" aria-hidden />{t("admin.circulars.history")}</DropdownMenuItem>
              {allowedCircularActions(r.status).length > 0 && <DropdownMenuSeparator />}
              {allowedCircularActions(r.status).map((a) => (
                <DropdownMenuItem key={a} onSelect={() => setAction({ row: r, action: a })} variant={a === "cancel" || a === "reject" ? "destructive" : "default"}>
                  {t(`enums.circularAction.${a}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {action && (action.action === "reject" || action.action === "extend") ? (
        <Dialog open onOpenChange={(o) => !o && close()}>
          <DialogContent>
            <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void run(); }}>
              <DialogHeader>
                <DialogTitle>{action.action === "reject" ? t("admin.circulars.rejectTitle") : t("admin.circulars.extendTitle")}</DialogTitle>
                <DialogDescription>{action.row.titleBn}{action.action === "extend" && <><br />{t("admin.circulars.currentEnd", { date: formatDateTimeBn(action.row.endAt) })}</>}</DialogDescription>
              </DialogHeader>
              {action.action === "reject" ? (
                <Field id="reject-reason" label={t("admin.circulars.reason")} required error={fieldError ?? undefined}>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
              ) : (
                <Field id="extend-date" label={t("admin.circulars.newEnd")} required error={fieldError ?? undefined}>
                  {(aria) => <DateTimeInput {...aria} value={newEnd} onChange={setNewEnd} />}
                </Field>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>{t("common.cancel")}</Button>
                <Button type="submit" loading={pending} variant={action.action === "reject" ? "destructive" : "default"}>{t(`enums.circularAction.${action.action}`)}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : (
        <ConfirmDialog
          open={!!action}
          onOpenChange={(o) => !o && close()}
          title={action ? t(`enums.circularAction.${action.action}`) : ""}
          description={action ? t("admin.circulars.confirmAction", { title: action.row.titleBn, action: t(`enums.circularAction.${action.action}`) }) : ""}
          destructive={action?.action === "cancel"}
          pending={pending}
          onConfirm={run}
        />
      )}
      <RevisionDrawer row={history} onClose={() => setHistory(null)} />
      <ConflictDialog open={conflict} onOpenChange={setConflict} onReload={() => { setConflict(false); void q.reload(); }} changes={[{ field: t("admin.circulars.colStatus"), yours: t("states.conflictYours"), theirs: t("states.conflictTheirs") }]} />
    </div>
  );
}
