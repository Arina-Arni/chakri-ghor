"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, Pencil, Plus, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { type Column, DataTable } from "@/components/admin/data-table";
import { OrgFormDialog } from "@/components/admin/org-form-dialog";
import { OrgAvatar } from "@/components/jobs/org-avatar";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { useSession } from "@/components/providers/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { changeUserRole, listAuditLogs, listOrganizations, listUsers, setOrganizationVerified, setUserStatus } from "@/data";
import { formatDateBn, formatDateTimeBn, parseDateInput, toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import type { AdminUser, AuditLogEntry, Organization } from "@/types";

export function OrganizationsAdminScreen() {
  const q = useData(() => listOrganizations(), []);
  const [edit, setEdit] = useState<Organization | null | "new">(null);
  const [verify, setVerify] = useState<Organization | null>(null);
  const [pending, setPending] = useState(false);
  const columns: Column<Organization>[] = [
    { id: "name", header: t("admin.orgs.nameBn"), primary: true, hideable: false, sortValue: (o) => o.nameBn, cell: (o) => <span className="flex items-center gap-2"><OrgAvatar shortName={o.shortName} seed={o.slug} size="sm" /><span><Link href={`/organizations/${o.slug}`} className="font-medium hover:underline">{o.nameBn}</Link><span className="block text-xs text-muted-foreground" lang="en">{o.nameEn}</span></span></span> },
    { id: "type", header: t("admin.orgs.type"), sortValue: (o) => o.type, cell: (o) => t(`enums.orgType.${o.type}`) },
    { id: "circ", header: t("admin.orgs.circulars"), sortValue: (o) => o.totalCircularCount, cell: (o) => <span className="tabular-nums">{toBnDigits(o.openCircularCount)} / {toBnDigits(o.totalCircularCount)}</span> },
    {
      id: "verified",
      header: t("admin.orgs.verified"),
      sortValue: (o) => (o.verified ? 1 : 0),
      cell: (o) => (
        <span className="flex items-center gap-2">
          <Switch checked={o.verified} onCheckedChange={() => setVerify(o)} aria-label={`${t("admin.orgs.verify")}: ${o.nameBn}`} />
          {o.verified ? <Badge size="sm" variant="primary"><ShieldCheck aria-hidden />{t("jobCard.verified")}</Badge> : <span className="text-sm text-muted-foreground">{t("jobCard.unverified")}</span>}
        </span>
      ),
    },
  ];
  return (
    <div>
      <PageHeader title={t("admin.orgs.title")} actions={<Button onClick={() => setEdit("new")}><Plus aria-hidden />{t("admin.orgs.new")}</Button>} />
      <DataTable caption={t("admin.orgs.title")} columns={columns} rows={q.data} rowKey={(o) => o.id} status={q.status} error={q.error} onRetry={q.reload} rowActions={(o) => <Button size="sm" variant="ghost" onClick={() => setEdit(o)} aria-label={`${t("common.edit")}: ${o.nameBn}`}><Pencil aria-hidden />{t("common.edit")}</Button>} />
      <OrgFormDialog open={edit != null} onOpenChange={(o) => !o && setEdit(null)} org={edit === "new" ? null : edit} onSaved={(o) => q.setData((xs) => (xs.some((x) => x.id === o.id) ? xs.map((x) => (x.id === o.id ? o : x)) : [o, ...xs]))} />
      <ConfirmDialog
        open={!!verify}
        onOpenChange={(o) => !o && setVerify(null)}
        title={t("admin.orgs.verify")}
        description={verify ? (verify.verified ? t("admin.orgs.unverifyConfirm", { name: verify.nameBn }) : t("admin.orgs.verifyConfirm", { name: verify.nameBn })) : ""}
        pending={pending}
        onConfirm={async () => {
          if (!verify) return;
          setPending(true);
          const r = await setOrganizationVerified(verify.id, !verify.verified, newIdempotencyKey());
          setPending(false);
          if (r.ok) {
            q.setData((xs) => xs.map((x) => (x.id === r.data.id ? r.data : x)));
            toast.success(t("admin.orgs.saved"));
          } else toast.error(r.error.message_bn);
          setVerify(null);
        }}
      />
    </div>
  );
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { role } = useSession();
  if (role !== "admin") return <EmptyState icon={ShieldCheck} title={t("admin.users.adminOnly")} />;
  return <>{children}</>;
}

export function UsersScreen() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const q = useData(() => listUsers({ q: search, role: roleFilter }), [search, roleFilter]);
  const [roleDialog, setRoleDialog] = useState<AdminUser | null>(null);
  const [newRole, setNewRole] = useState<AdminUser["role"]>("seeker");
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [suspend, setSuspend] = useState<AdminUser | null>(null);
  const [pending, setPending] = useState(false);
  const replace = (u: AdminUser) => q.setData((xs) => xs.map((x) => (x.id === u.id ? u : x)));
  const columns: Column<AdminUser>[] = [
    { id: "name", header: t("admin.users.colName"), primary: true, hideable: false, sortValue: (u) => u.name, cell: (u) => <span className="font-medium">{u.name}</span> },
    { id: "email", header: t("admin.users.colEmail"), sortValue: (u) => u.email, cell: (u) => <span lang="en">{u.email}</span> },
    { id: "role", header: t("admin.users.colRole"), sortValue: (u) => u.role, cell: (u) => <Badge size="sm" variant={u.role === "admin" ? "ai" : u.role === "moderator" ? "info" : "neutral"}>{t(`nav.roles.${u.role}`)}</Badge> },
    { id: "status", header: t("admin.users.colStatus"), sortValue: (u) => u.status, cell: (u) => <Badge size="sm" variant={u.status === "active" ? "success" : "danger"}>{t(`enums.userStatus.${u.status}`)}</Badge> },
    { id: "joined", header: t("admin.users.colJoined"), sortValue: (u) => u.joinedAt, cell: (u) => formatDateBn(u.joinedAt) },
  ];
  return (
    <div>
      <PageHeader title={t("admin.users.title")} />
      <AdminOnly>
        <DataTable
          caption={t("admin.users.title")}
          columns={columns}
          rows={q.data}
          rowKey={(u) => u.id}
          status={q.status}
          error={q.error}
          onRetry={q.reload}
          toolbar={
            <>
              <div className="w-full sm:w-72"><label htmlFor="u-q" className="text-sm text-muted-foreground">{t("common.search")}</label><Input id="u-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.users.search")} /></div>
              <div>
                <label htmlFor="u-role" className="block text-sm text-muted-foreground">{t("admin.users.colRole")}</label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger id="u-role" className="min-w-36"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">{t("common.all")}</SelectItem>{(["seeker", "moderator", "admin"] as const).map((r) => <SelectItem key={r} value={r}>{t(`nav.roles.${r}`)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          }
          rowActions={(u) => (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => { setRoleDialog(u); setNewRole(u.role); setPw(""); setPwErr(null); }}><UserCog aria-hidden />{t("admin.users.changeRole")}</Button>
              <Button size="sm" variant={u.status === "active" ? "destructive-soft" : "secondary"} onClick={() => setSuspend(u)}>{u.status === "active" ? t("admin.users.suspend") : t("admin.users.unsuspend")}</Button>
            </div>
          )}
        />
      </AdminOnly>
      <Dialog open={!!roleDialog} onOpenChange={(o) => !o && setRoleDialog(null)}>
        <DialogContent>
          {roleDialog && (
            <form className="grid gap-4" onSubmit={async (e) => {
              e.preventDefault();
              if (!pw) return setPwErr(t("validation.required"));
              setPending(true);
              const r = await changeUserRole(roleDialog.id, newRole, pw, newIdempotencyKey());
              setPending(false);
              if (r.ok) { replace(r.data); toast.success(t("admin.users.roleChanged")); setRoleDialog(null); }
              else setPwErr(r.error.fields?.adminPassword ?? r.error.message_bn);
            }}>
              <DialogHeader>
                <DialogTitle>{t("admin.users.changeRoleTitle", { name: roleDialog.name })}</DialogTitle>
                <DialogDescription lang="en">{roleDialog.email}</DialogDescription>
              </DialogHeader>
              <Field id="nr" label={t("admin.users.newRole")} required>
                {(aria) => (
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AdminUser["role"])}>
                    <SelectTrigger {...aria} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{(["seeker", "moderator", "admin"] as const).map((r) => <SelectItem key={r} value={r}>{t(`nav.roles.${r}`)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </Field>
              <Field id="admin-pw" label={t("admin.users.adminPassword")} required error={pwErr ?? undefined}><PasswordInput value={pw} onChange={(e) => { setPw(e.target.value); setPwErr(null); }} autoComplete="current-password" /></Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRoleDialog(null)}>{t("common.cancel")}</Button>
                <Button type="submit" loading={pending}>{t("common.confirm")}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!suspend}
        onOpenChange={(o) => !o && setSuspend(null)}
        destructive={suspend?.status === "active"}
        title={suspend?.status === "active" ? t("admin.users.suspend") : t("admin.users.unsuspend")}
        description={suspend ? (suspend.status === "active" ? t("admin.users.suspendConfirm", { name: suspend.name }) : suspend.name) : ""}
        pending={pending}
        onConfirm={async () => {
          if (!suspend) return;
          setPending(true);
          const r = await setUserStatus(suspend.id, suspend.status === "active" ? "suspended" : "active", newIdempotencyKey());
          setPending(false);
          if (r.ok) { replace(r.data); toast.success(t("admin.users.statusChanged")); } else toast.error(r.error.message_bn);
          setSuspend(null);
        }}
      />
    </div>
  );
}

function JsonDiff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return (
    <table className="w-full text-left text-sm" lang="en">
      <caption className="sr-only">{t("admin.audit.details")}</caption>
      <thead><tr className="border-b text-muted-foreground"><th scope="col" className="py-1" lang="bn">{t("admin.circulars.field")}</th><th scope="col" lang="bn">{t("admin.audit.before")}</th><th scope="col" lang="bn">{t("admin.audit.after")}</th></tr></thead>
      <tbody>
        {keys.map((k) => {
          const b = JSON.stringify(before?.[k] ?? null);
          const a = JSON.stringify(after?.[k] ?? null);
          return (
            <tr key={k} className="border-b align-top last:border-0">
              <th scope="row" className="py-1.5 pr-2 font-mono text-xs">{k}</th>
              <td className={`py-1.5 pr-2 font-mono text-xs ${b !== a ? "text-danger line-through decoration-danger/40" : ""}`}>{b}</td>
              <td className={`py-1.5 font-mono text-xs ${b !== a ? "font-semibold text-success" : ""}`}>{a}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function AuditScreen() {
  const [f, setF] = useState({ actor: "", action: "", entity: "all", from: "", to: "" });
  const iso = (s: string) => {
    const r = parseDateInput(s);
    return "iso" in r ? r.iso : undefined;
  };
  const q = useData(() => listAuditLogs({ actor: f.actor || undefined, action: f.action || undefined, entity: f.entity, from: iso(f.from), to: iso(f.to) }), [JSON.stringify(f)]);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);
  const columns: Column<AuditLogEntry>[] = [
    { id: "time", header: t("admin.audit.time"), sortValue: (a) => a.at, cell: (a) => <span className="whitespace-nowrap">{formatDateTimeBn(a.at)}</span> },
    { id: "actor", header: t("admin.audit.actor"), primary: true, sortValue: (a) => a.actor.name, cell: (a) => <span>{a.actor.name} <Badge size="sm" variant="outline">{t(`nav.roles.${a.actor.role}`)}</Badge></span> },
    { id: "action", header: t("admin.audit.action"), sortValue: (a) => a.action, cell: (a) => <code className="text-xs" lang="en">{a.action}</code> },
    { id: "entity", header: t("admin.audit.entity"), sortValue: (a) => a.entityType, cell: (a) => <code className="text-xs" lang="en">{a.entityType}:{a.entityId}</code> },
  ];
  return (
    <div>
      <PageHeader title={t("admin.audit.title")} />
      <AdminOnly>
        <DataTable
          caption={t("admin.audit.title")}
          columns={columns}
          rows={q.data}
          rowKey={(a) => a.id}
          status={q.status}
          error={q.error}
          onRetry={q.reload}
          initialSort={{ id: "time", dir: "desc" }}
          empty={<EmptyState title={t("admin.audit.empty")} />}
          toolbar={
            <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div><label htmlFor="a-actor" className="text-sm text-muted-foreground">{t("admin.audit.actor")}</label><Input id="a-actor" value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })} /></div>
              <div><label htmlFor="a-action" className="text-sm text-muted-foreground">{t("admin.audit.action")}</label><Input id="a-action" lang="en" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} placeholder="circular.extend" /></div>
              <div>
                <label htmlFor="a-entity" className="block text-sm text-muted-foreground">{t("admin.audit.entity")}</label>
                <Select value={f.entity} onValueChange={(v) => setF({ ...f, entity: v })}>
                  <SelectTrigger id="a-entity" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">{t("common.all")}</SelectItem>{["circular", "organization", "user", "settings", "workflow_run"].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label htmlFor="a-from" className="text-sm text-muted-foreground">{t("admin.audit.from")}</label><DateInput id="a-from" value={f.from} onChange={(v) => setF({ ...f, from: v })} /></div>
              <div><label htmlFor="a-to" className="text-sm text-muted-foreground">{t("admin.audit.to")}</label><DateInput id="a-to" value={f.to} onChange={(v) => setF({ ...f, to: v })} /></div>
            </div>
          }
          rowActions={(a) => <Button size="sm" variant="ghost" onClick={() => setDetail(a)} aria-label={`${t("admin.audit.details")}: ${a.action}`}><Eye aria-hidden />{t("admin.audit.details")}</Button>}
        />
      </AdminOnly>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle><code lang="en">{detail.action}</code></DialogTitle>
                <DialogDescription>{detail.actor.name} · {formatDateTimeBn(detail.at)} · <span lang="en">{detail.requestId}</span></DialogDescription>
              </DialogHeader>
              <JsonDiff before={detail.before} after={detail.after} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
