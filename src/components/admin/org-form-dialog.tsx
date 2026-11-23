"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveOrganization } from "@/data";
import { useMutation } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { applyServerErrors } from "@/lib/form";
import { organizationSchema, type OrganizationInput } from "@/schemas/circular";
import type { Organization, OrganizationType } from "@/types";
import type { z } from "zod";

const TYPES: OrganizationType[] = ["ministry", "directorate", "district_office", "corporation", "bank", "autonomous", "company", "ngo"];

export function OrgFormDialog({ open, onOpenChange, org, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; org: Organization | null; onSaved: (o: Organization) => void }) {
  const form = useForm<OrganizationInput, unknown, z.output<typeof organizationSchema>>({
    resolver: zodResolver(organizationSchema),
    values: org ? { nameBn: org.nameBn, nameEn: org.nameEn, shortName: org.shortName, type: org.type, website: org.website ?? "" } : { nameBn: "", nameEn: "", shortName: "", type: "directorate", website: "" },
  });
  const m = useMutation((k: string, v: z.output<typeof organizationSchema>) => saveOrganization({ ...v, website: v.website || null }, org?.id ?? null, org?.version ?? null, k), {
    successMessage: t("admin.orgs.saved"),
    toastError: true,
    onSuccess: (o) => {
      onSaved(o);
      onOpenChange(false);
    },
    onError: (e) => applyServerErrors(e.fields, form.setError as never),
  });
  const { errors } = form.formState;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form noValidate className="grid gap-4" onSubmit={form.handleSubmit((v) => void m.run(v))}>
          <DialogHeader>
            <DialogTitle>{org ? t("admin.orgs.edit") : t("admin.orgs.new")}</DialogTitle>
            <DialogDescription className="sr-only">{t("admin.orgs.title")}</DialogDescription>
          </DialogHeader>
          <Field id="org-nameBn" label={t("admin.orgs.nameBn")} required error={errors.nameBn?.message}><Input {...form.register("nameBn")} /></Field>
          <Field id="org-nameEn" label={t("admin.orgs.nameEn")} required error={errors.nameEn?.message}><Input lang="en" {...form.register("nameEn")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="org-short" label={t("admin.orgs.shortName")} required error={errors.shortName?.message}><Input lang="en" maxLength={4} {...form.register("shortName")} /></Field>
            <Controller control={form.control} name="type" render={({ field }) => (
              <Field id="org-type" label={t("admin.orgs.type")} required>
                {(aria) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger {...aria} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map((x) => <SelectItem key={x} value={x}>{t(`enums.orgType.${x}`)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </Field>
            )} />
          </div>
          <Field id="org-web" label={t("admin.orgs.website")} error={errors.website?.message}><Input type="url" lang="en" {...form.register("website")} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" loading={m.pending}>{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
