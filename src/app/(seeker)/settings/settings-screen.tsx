"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, LogOut, Mail, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ConflictDialog } from "@/components/feedback/conflict-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { changeEmail, changePassword, deleteAccount, exportMyData, getSettings, saveSettings, signOutEverywhere } from "@/data";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey, useMutation } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { applyServerErrors } from "@/lib/form";
import { changeEmailSchema, changePasswordSchema } from "@/schemas/seeker";
import type { Settings } from "@/types";
import type { z } from "zod";

function EmailDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<z.input<typeof changeEmailSchema>>({ resolver: zodResolver(changeEmailSchema), defaultValues: { newEmail: "", currentPassword: "" } });
  const m = useMutation((k: string, v: z.input<typeof changeEmailSchema>) => changeEmail(v.newEmail, v.currentPassword, k), {
    toastError: false,
    successMessage: t("settings.emailChangeSent"),
    onSuccess: () => {
      form.reset();
      onOpenChange(false);
    },
    onError: (e) => applyServerErrors(e.fields, form.setError as never),
  });
  const { errors } = form.formState;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form noValidate className="grid gap-4" onSubmit={form.handleSubmit((v) => void m.run(v))}>
          <DialogHeader>
            <DialogTitle>{t("settings.reauthTitle")}</DialogTitle>
            <DialogDescription>{t("settings.reauthBody")}</DialogDescription>
          </DialogHeader>
          <Field id="newEmail" label={t("settings.newEmail")} required error={errors.newEmail?.message}>
            <Input type="email" {...form.register("newEmail")} />
          </Field>
          <Field id="em-pass" label={t("settings.currentPassword")} required error={errors.currentPassword?.message}>
            <PasswordInput autoComplete="current-password" {...form.register("currentPassword")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" loading={m.pending}>{t("common.confirm")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordForm() {
  const form = useForm<z.input<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", password: "", confirm: "" }, mode: "onTouched" });
  const m = useMutation((k: string, v: z.input<typeof changePasswordSchema>) => changePassword(v.currentPassword, v.password, k), {
    toastError: false,
    successMessage: t("settings.passwordChanged"),
    onSuccess: () => form.reset(),
    onError: (e) => applyServerErrors(e.fields, form.setError as never),
  });
  const { errors } = form.formState;
  return (
    <form noValidate className="grid gap-4 md:max-w-md" onSubmit={form.handleSubmit((v) => void m.run(v))}>
      <Field id="pw-current" label={t("settings.currentPassword")} required error={errors.currentPassword?.message}>
        <PasswordInput autoComplete="current-password" {...form.register("currentPassword")} />
      </Field>
      <Field id="pw-new" label={t("auth.newPassword")} required error={errors.password?.message} hint={t("validation.passwordWeak")}>
        <PasswordInput autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field id="pw-confirm" label={t("auth.confirmPassword")} required error={errors.confirm?.message}>
        <PasswordInput autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      <Button type="submit" loading={m.pending} className="justify-self-start">{t("settings.changePassword")}</Button>
    </form>
  );
}

function NotificationSwitches() {
  const q = useData(() => getSettings(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  if (q.status === "loading") return <FormSkeleton fields={4} />;
  if (q.status === "error") return <ErrorState error={q.error} onRetry={q.reload} />;
  const s = q.data;
  const items: [keyof Settings["notifications"], string][] = [
    ["email", t("settings.notifEmail")],
    ["deadlineReminders", t("settings.notifDeadline")],
    ["newMatches", t("settings.notifMatches")],
    ["examReminders", t("settings.notifExams")],
  ];
  return (
    <>
      <ul className="divide-y">
        {items.map(([k, label]) => (
          <li key={k} className="flex min-h-14 items-center justify-between gap-3">
            <label htmlFor={`n-${k}`} className="font-medium">{label}</label>
            <Switch
              id={`n-${k}`}
              checked={s.notifications[k]}
              disabled={busy != null}
              onCheckedChange={async (v) => {
                setBusy(k);
                const r = await saveSettings({ [k]: v }, s.version, newIdempotencyKey());
                setBusy(null);
                if (r.ok) {
                  q.setData(r.data);
                  toast.success(t("settings.notifSaved"));
                } else if (r.error.code === "CONFLICT") setConflict(true);
                else toast.error(r.error.message_bn);
              }}
            />
          </li>
        ))}
      </ul>
      <ConflictDialog open={conflict} onOpenChange={setConflict} onReload={() => { setConflict(false); void q.reload(); }} changes={[{ field: t("settings.tabNotifications"), yours: t("states.conflictYours"), theirs: t("states.conflictTheirs") }]} />
    </>
  );
}

export function SettingsScreen() {
  const { me } = useSession();
  const router = useRouter();
  const [emailOpen, setEmailOpen] = useState(false);
  const [logoutAll, setLogoutAll] = useState(false);
  const [del, setDel] = useState(false);
  const [delPass, setDelPass] = useState("");
  const [delPending, setDelPending] = useState(false);
  const signOutAll = useMutation((k: string) => signOutEverywhere(k), { successMessage: t("settings.logoutAllDone"), onSuccess: () => setLogoutAll(false) });
  const exp = useMutation(() => exportMyData(), {
    onSuccess: (d) => {
      const url = URL.createObjectURL(new Blob([d.json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = d.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(t("settings.exportDone"));
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("settings.title")} />
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">{t("settings.tabAccount")}</TabsTrigger>
          <TabsTrigger value="notifications">{t("settings.tabNotifications")}</TabsTrigger>
          <TabsTrigger value="security">{t("settings.tabSecurity")}</TabsTrigger>
          <TabsTrigger value="data">{t("settings.tabData")}</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="space-y-6">
          <Card>
            <CardHeader title={t("settings.tabAccount")} />
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-sm text-muted-foreground">{t("auth.name")}</dt><dd className="font-medium">{me?.fullName}</dd></div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("auth.email")}</dt>
                <dd className="flex flex-wrap items-center gap-2 font-medium">
                  {me?.email}
                  <Button size="sm" variant="secondary" onClick={() => setEmailOpen(true)}><Mail aria-hidden />{t("settings.changeEmail")}</Button>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted-foreground">নাম বদলাতে <a href="/profile" className="text-primary underline">প্রোফাইল</a> পেজে যান।</p>
          </Card>
          <Card>
            <CardHeader title={t("settings.changePassword")} />
            <PasswordForm />
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card><CardHeader title={t("settings.tabNotifications")} /><NotificationSwitches /></Card>
        </TabsContent>
        <TabsContent value="security">
          <Card>
            <CardHeader title={t("settings.logoutAll")} description={t("settings.logoutAllBody")} />
            <Button variant="secondary" onClick={() => setLogoutAll(true)}><LogOut aria-hidden />{t("settings.logoutAll")}</Button>
          </Card>
        </TabsContent>
        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader title={t("settings.exportData")} description={t("settings.exportBody")} />
            <Button variant="secondary" loading={exp.pending} onClick={() => void exp.run()}><Download aria-hidden />{t("settings.exportData")}</Button>
          </Card>
          <section aria-labelledby="danger-h" className="rounded-xl border-2 border-danger/40 bg-danger-soft/30 p-5">
            <h2 id="danger-h" className="flex items-center gap-2 text-lg font-semibold text-danger"><ShieldAlert className="size-5" aria-hidden />{t("settings.dangerZone")}</h2>
            <p className="mt-1 text-ink">{t("settings.deleteBody")}</p>
            <Button variant="destructive" className="mt-4" onClick={() => setDel(true)}><Trash2 aria-hidden />{t("settings.deleteAccount")}</Button>
          </section>
        </TabsContent>
      </Tabs>

      <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} />
      <ConfirmDialog open={logoutAll} onOpenChange={setLogoutAll} title={t("settings.logoutAll")} description={t("settings.logoutAllBody")} pending={signOutAll.pending} onConfirm={() => void signOutAll.run()} />
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        destructive
        title={t("settings.deleteAccount")}
        description={`${me?.email ?? ""} — ${t("settings.deleteBody")}`}
        requireText={t("settings.deleteConfirmWord")}
        confirmLabel={t("settings.deleteAccount")}
        pending={delPending}
        onConfirm={async () => {
          if (!delPass) return void toast.error(`${t("settings.currentPassword")}: ${t("validation.required")}`);
          setDelPending(true);
          const r = await deleteAccount({ text: t("settings.deleteConfirmWord"), password: delPass });
          setDelPending(false);
          if (r.ok) {
            toast.success(t("settings.deleted"));
            router.push("/");
          } else toast.error(r.error.message_bn);
        }}
      >
        <Field id="del-pass" label={t("settings.currentPassword")} required>
          <PasswordInput value={delPass} onChange={(e) => setDelPass(e.target.value)} autoComplete="current-password" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
