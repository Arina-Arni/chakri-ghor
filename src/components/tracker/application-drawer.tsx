"use client";

import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CircleDot, ExternalLink, Trash2, Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Timeline } from "@/components/ui/stepper";
import { formatDateTimeBn, formatDateTimeInput } from "@/domain/bn";
import { useIsDesktop } from "@/hooks/use-media-query";
import { t } from "@/i18n";
import { applicationUpdateSchema, type ApplicationUpdateInput } from "@/schemas/seeker";
import type { Application, ApplicationPatch } from "@/types";
import type { z } from "zod";
import { STATUS_TONE } from "./status-select";

type Out = z.output<typeof applicationUpdateSchema>;

export function ApplicationDrawer({
  app,
  open,
  onOpenChange,
  onSave,
  onWithdraw,
  onDelete,
  saving,
}: {
  app: Application | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (patch: ApplicationPatch) => Promise<void>;
  onWithdraw: () => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
}) {
  const desktop = useIsDesktop();
  const [confirm, setConfirm] = useState<null | "withdraw" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<ApplicationUpdateInput, unknown, Out>({
    resolver: zodResolver(applicationUpdateSchema),
    values: app
      ? { applicantRef: app.applicantRef ?? "", feePaid: app.feePaid, examAt: formatDateTimeInput(app.examAt), examVenue: app.examVenue ?? "", notes: app.notes }
      : undefined,
  });
  const { errors } = form.formState;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={desktop ? "right" : "bottom"} className="max-h-[92dvh] w-full overflow-y-auto sm:max-w-lg data-[side=right]:sm:max-w-lg">
        {app && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8">{app.jobTitleBn}</SheetTitle>
              <SheetDescription>{app.organizationNameBn}</SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant={STATUS_TONE[app.status]}>{t(`enums.applicationStatus.${app.status}`)}</Badge>
                <Link href={`/jobs/${app.circularSlug}`} className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {t("tracker.openJob")}
                  <ExternalLink className="size-4" aria-hidden />
                </Link>
              </div>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-6">
              <section aria-labelledby="tl-h">
                <h3 id="tl-h" className="mb-3 font-semibold">{t("tracker.timeline")}</h3>
                <Timeline
                  items={[...app.events].reverse().map((e) => ({
                    id: e.id,
                    icon: e.fromStatus ? <ArrowRight className="size-4" aria-hidden /> : <CircleDot className="size-4" aria-hidden />,
                    tone: e.toStatus === "rejected" ? "danger" : e.toStatus === "selected" ? "success" : e.toStatus === "withdrawn" ? "muted" : "default",
                    title: e.fromStatus ? `${t(`enums.applicationStatus.${e.fromStatus}`)} → ${t(`enums.applicationStatus.${e.toStatus}`)}` : (e.note ?? t(`enums.applicationStatus.${e.toStatus}`)),
                    meta: formatDateTimeBn(e.createdAt),
                  }))}
                />
              </section>
              <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => onSave({ ...v, applicantRef: v.applicantRef || null, examVenue: v.examVenue || null }))}>
                <Field id="app-ref" label={t("tracker.applicantRef")} error={errors.applicantRef?.message}>
                  <Input {...form.register("applicantRef")} />
                </Field>
                <Controller control={form.control} name="feePaid" render={({ field }) => (
                  <div className="flex min-h-11 items-center justify-between gap-3">
                    <label htmlFor="app-fee" className="font-medium">{t("tracker.feePaid")}</label>
                    <Switch id="app-fee" checked={field.value} onCheckedChange={field.onChange} />
                  </div>
                )} />
                <Controller control={form.control} name="examAt" render={({ field }) => (
                  <Field id="app-exam" label={t("tracker.examDate")} error={errors.examAt?.message ?? (errors.examAt as { date?: { message?: string } } | undefined)?.date?.message}>
                    {(aria) => <DateTimeInput {...aria} value={field.value} onChange={field.onChange} />}
                  </Field>
                )} />
                <Field id="app-venue" label={t("tracker.examVenue")} error={errors.examVenue?.message}>
                  <Input {...form.register("examVenue")} />
                </Field>
                <Field id="app-notes" label={t("tracker.notes")} error={errors.notes?.message}>
                  <Textarea rows={3} {...form.register("notes")} />
                </Field>
                <Button type="submit" loading={saving} className="w-full">{t("common.save")}</Button>
              </form>
              <div className="grid grid-cols-2 gap-2 border-t pt-4">
                <Button variant="secondary" disabled={["withdrawn", "selected", "rejected"].includes(app.status)} onClick={() => setConfirm("withdraw")}>
                  <Undo2 aria-hidden />
                  {t("tracker.withdraw")}
                </Button>
                <Button variant="destructive-soft" onClick={() => setConfirm("delete")}>
                  <Trash2 aria-hidden />
                  {t("tracker.deleteApp")}
                </Button>
              </div>
            </div>
            <ConfirmDialog
              open={confirm != null}
              onOpenChange={(o) => !o && setConfirm(null)}
              destructive={confirm === "delete"}
              pending={busy}
              title={confirm === "delete" ? t("tracker.deleteApp") : t("tracker.withdraw")}
              description={confirm === "delete" ? t("tracker.deleteConfirm", { title: app.jobTitleBn }) : t("tracker.withdrawConfirm", { title: app.jobTitleBn })}
              confirmLabel={confirm === "delete" ? t("common.delete") : t("common.confirm")}
              onConfirm={async () => {
                setBusy(true);
                await (confirm === "delete" ? onDelete() : onWithdraw());
                setBusy(false);
                setConfirm(null);
              }}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
