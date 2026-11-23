"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConflictDialog } from "@/components/feedback/conflict-dialog";
import { Notice } from "@/components/feedback/notice";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { DateInput, DateTimeInput } from "@/components/ui/date-input";
import { ErrorSummary, Field, Fieldset } from "@/components/ui/field";
import { FileDropzone, type DropzoneState } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveCircular } from "@/data";
import { formatDateInput, formatDateTimeInput, toBnDigits } from "@/domain/bn";
import { useLocalDraft } from "@/hooks/use-local-draft";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { useTaxonomy } from "@/hooks/use-taxonomy";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { t } from "@/i18n";
import { flattenErrors } from "@/lib/form";
import { circularSchema, type CircularFormInput, type CircularFormOutput, type PostFormInput } from "@/schemas/circular";
import { CIRCULAR_FILE } from "@/schemas/common";
import { EDUCATION_LEVELS, type Circular, type CircularPost, type Organization } from "@/types";
import { OrgFormDialog } from "./org-form-dialog";

type Out = CircularFormOutput;

const emptyPost = (): PostFormInput => ({
  id: "",
  titleBn: "",
  titleEn: "",
  vacancies: "",
  grade: "",
  salaryMin: "",
  salaryMax: "",
  salaryText: "",
  minEducation: "hsc",
  subjectsText: "",
  experienceYears: "০",
  ageMin: "১৮",
  ageMax: "৩০",
  ageRelaxations: [],
  eligibleDistrictIds: [],
  eligibleDivisionIds: [],
  gender: "any",
  otherRequirements: [],
  keywordsRequired: [],
  keywordsPreferred: [],
});

const n = (v: number | null) => (v == null ? "" : toBnDigits(v));

export function toFormValues(c: Circular | null): CircularFormInput {
  if (!c)
    return {
      organizationId: "",
      noticeNo: "",
      titleBn: "",
      titleEn: "",
      descriptionBn: "",
      sector: "government",
      jobType: "full_time",
      workMode: "onsite",
      startAt: { date: "", time: "১০:০০" },
      endAt: { date: "", time: "১৭:০০" },
      ageReferenceDate: "",
      applyUrl: "",
      applyPlatform: "teletalk",
      applicationFee: "",
      sourceUrl: "",
      posts: [emptyPost()],
      categoryId: "",
      tagSlugs: [],
      divisionId: "",
      districtId: "",
    };
  return {
    organizationId: c.organization.id,
    noticeNo: c.noticeNo,
    titleBn: c.titleBn,
    titleEn: c.titleEn,
    descriptionBn: c.descriptionBn,
    sector: c.sector,
    jobType: c.jobType,
    workMode: c.workMode,
    startAt: formatDateTimeInput(c.startAt),
    endAt: formatDateTimeInput(c.endAt),
    ageReferenceDate: formatDateInput(c.ageReferenceDate),
    applyUrl: c.applyUrl,
    applyPlatform: c.applyPlatform,
    applicationFee: n(c.applicationFee),
    sourceUrl: c.sourceUrl,
    categoryId: c.categoryId,
    tagSlugs: c.tagSlugs,
    divisionId: c.divisionId ?? "",
    districtId: c.districtId ?? "",
    posts: c.posts.map((p) => ({
      id: p.id,
      titleBn: p.titleBn,
      titleEn: p.titleEn,
      vacancies: n(p.vacancies),
      grade: p.grade ?? "",
      salaryMin: n(p.salaryMin),
      salaryMax: n(p.salaryMax),
      salaryText: p.salaryText ?? "",
      minEducation: p.minEducation,
      subjectsText: p.subjects.join(", "),
      experienceYears: n(p.experienceYears),
      ageMin: n(p.ageMin),
      ageMax: n(p.ageMax),
      ageRelaxations: p.ageRelaxations.map((r) => ({ categoryBn: r.categoryBn, extraYears: toBnDigits(r.extraYears) })),
      eligibleDistrictIds: p.eligibleDistrictIds ?? [],
      eligibleDivisionIds: p.eligibleDivisionIds ?? [],
      gender: p.gender,
      otherRequirements: p.otherRequirements.map((value) => ({ value })),
      keywordsRequired: p.keywordsRequired,
      keywordsPreferred: p.keywordsPreferred,
    })),
  };
}

function toDraft(v: Out) {
  return {
    ...v,
    districtId: v.districtId || null,
    divisionId: v.divisionId || null,
    sourceUrl: v.sourceUrl,
    posts: v.posts.map(
      (p): CircularPost => ({
        id: p.id,
        circularId: "",
        titleBn: p.titleBn,
        titleEn: p.titleEn,
        vacancies: p.vacancies,
        grade: p.grade || null,
        salaryMin: p.salaryMin,
        salaryMax: p.salaryMax,
        salaryText: p.salaryText || null,
        minEducation: p.minEducation,
        subjects: p.subjectsText.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
        experienceYears: p.experienceYears,
        ageMin: p.ageMin,
        ageMax: p.ageMax,
        ageRelaxations: p.ageRelaxations,
        eligibleDistrictIds: p.eligibleDistrictIds.length ? p.eligibleDistrictIds : null,
        eligibleDivisionIds: p.eligibleDivisionIds.length ? p.eligibleDivisionIds : null,
        gender: p.gender,
        otherRequirements: p.otherRequirements.map((o) => o.value),
        manualChecks: [],
        keywordsRequired: p.keywordsRequired,
        keywordsPreferred: p.keywordsPreferred,
      }),
    ),
  };
}

const TOP: Record<string, string> = {
  organizationId: t("admin.form.organization"),
  noticeNo: t("admin.form.noticeNo"),
  titleBn: t("admin.form.titleBn"),
  "startAt.date": t("admin.form.startAt"),
  "endAt.date": t("admin.form.endAt"),
  startAt: t("admin.form.startAt"),
  endAt: t("admin.form.endAt"),
  ageReferenceDate: t("admin.form.ageRef"),
  applyUrl: t("admin.form.applyUrl"),
  sourceUrl: t("admin.form.sourceUrl"),
  applicationFee: t("admin.form.fee"),
  categoryId: t("admin.form.category"),
};
const POSTF: Record<string, string> = {
  titleBn: t("admin.form.postTitleBn"),
  vacancies: t("admin.form.vacancies"),
  salaryMin: t("admin.form.salaryMin"),
  salaryMax: t("admin.form.salaryMax"),
  ageMin: t("admin.form.ageMin"),
  ageMax: t("admin.form.ageMax"),
  experienceYears: t("admin.form.experience"),
};
function labelFor(path: string) {
  const m = /^posts\.(\d+)\.(\w+)/.exec(path);
  if (m) return `${t("admin.form.postN", { n: Number(m[1]) + 1 })} — ${POSTF[m[2]] ?? m[2]}`;
  return TOP[path] ?? path;
}

function PostEditor({ index, control, register, errors, onRemove, canRemove }: { index: number; control: Control<CircularFormInput, unknown, Out>; register: UseFormRegister<CircularFormInput>; errors: FieldErrors<CircularFormInput>; onRemove: () => void; canRemove: boolean }) {
  const tax = useTaxonomy();
  const relax = useFieldArray({ control, name: `posts.${index}.ageRelaxations` });
  const reqs = useFieldArray({ control, name: `posts.${index}.otherRequirements` });
  const e = errors.posts?.[index];
  const id = (f: string) => `posts-${index}-${f}`;
  return (
    <li className="rounded-xl border bg-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("admin.form.postN", { n: index + 1 })}</h3>
        {canRemove && <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={t("admin.form.removePost", { n: index + 1 })}><Trash2 aria-hidden />{t("common.remove")}</Button>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={id("titleBn")} label={t("admin.form.postTitleBn")} required error={e?.titleBn?.message}><Input {...register(`posts.${index}.titleBn`)} /></Field>
        <Field id={id("titleEn")} label={t("admin.form.postTitleEn")} error={e?.titleEn?.message}><Input lang="en" {...register(`posts.${index}.titleEn`)} /></Field>
        <Field id={id("vacancies")} label={t("admin.form.vacancies")} required error={e?.vacancies?.message}><Input inputMode="numeric" {...register(`posts.${index}.vacancies`)} /></Field>
        <Field id={id("grade")} label={t("admin.form.grade")} error={e?.grade?.message}><Input {...register(`posts.${index}.grade`)} /></Field>
        <Field id={id("salaryMin")} label={t("admin.form.salaryMin")} error={e?.salaryMin?.message}><Input inputMode="numeric" {...register(`posts.${index}.salaryMin`)} /></Field>
        <Field id={id("salaryMax")} label={t("admin.form.salaryMax")} error={e?.salaryMax?.message}><Input inputMode="numeric" {...register(`posts.${index}.salaryMax`)} /></Field>
        <Field id={id("salaryText")} label={t("admin.form.salaryText")} className="md:col-span-2"><Input {...register(`posts.${index}.salaryText`)} /></Field>
        <Controller control={control} name={`posts.${index}.minEducation`} render={({ field }) => (
          <Field id={id("minEducation")} label={t("admin.form.minEducation")} required>
            {(aria) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger {...aria} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{EDUCATION_LEVELS.map((l) => <SelectItem key={l} value={l}>{t(`enums.education.${l}`)}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
        )} />
        <Field id={id("subjectsText")} label={t("admin.form.subjects")}><Input {...register(`posts.${index}.subjectsText`)} /></Field>
        <Field id={id("experienceYears")} label={t("admin.form.experience")} required error={e?.experienceYears?.message}><Input inputMode="numeric" {...register(`posts.${index}.experienceYears`)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id={id("ageMin")} label={t("admin.form.ageMin")} error={e?.ageMin?.message}><Input inputMode="numeric" {...register(`posts.${index}.ageMin`)} /></Field>
          <Field id={id("ageMax")} label={t("admin.form.ageMax")} error={e?.ageMax?.message}><Input inputMode="numeric" {...register(`posts.${index}.ageMax`)} /></Field>
        </div>
      </div>

      <Fieldset legend={t("admin.form.relaxations")} className="mt-5">
        <ul className="space-y-2">
          {relax.fields.map((f, i) => (
            <li key={f.id} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
              <Field id={`${id("ageRelaxations")}-${i}-categoryBn`} label={t("admin.form.relaxCategory")} error={e?.ageRelaxations?.[i]?.categoryBn?.message}><Input {...register(`posts.${index}.ageRelaxations.${i}.categoryBn`)} /></Field>
              <Field id={`${id("ageRelaxations")}-${i}-extraYears`} label={t("admin.form.relaxYears")} error={e?.ageRelaxations?.[i]?.extraYears?.message}><Input inputMode="numeric" {...register(`posts.${index}.ageRelaxations.${i}.extraYears`)} /></Field>
              <Button type="button" variant="ghost" size="icon" onClick={() => relax.remove(i)} aria-label={`${t("common.remove")} ${t("admin.form.relaxations")} ${toBnDigits(i + 1)}`}><Trash2 aria-hidden /></Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" onClick={() => relax.append({ categoryBn: "", extraYears: "২" })}><Plus aria-hidden />{t("admin.form.addRelaxation")}</Button>
      </Fieldset>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Controller control={control} name={`posts.${index}.eligibleDistrictIds`} render={({ field }) => (
          <Field id={id("districts")} label={t("admin.form.eligibleDistricts")}>
            {(aria) => <MultiCombobox {...aria} value={field.value} onChange={field.onChange} options={(tax?.districts ?? []).map((d) => ({ value: d.id, label: d.nameBn, keywords: [d.nameEn, ...d.aliases] }))} />}
          </Field>
        )} />
        <Controller control={control} name={`posts.${index}.eligibleDivisionIds`} render={({ field }) => (
          <Field id={id("divisions")} label={t("admin.form.eligibleDivisions")}>
            {(aria) => <MultiCombobox {...aria} value={field.value} onChange={field.onChange} options={(tax?.divisions ?? []).map((d) => ({ value: d.id, label: d.nameBn, keywords: [d.nameEn] }))} />}
          </Field>
        )} />
        <Controller control={control} name={`posts.${index}.gender`} render={({ field }) => (
          <Fieldset legend={t("admin.form.genderRule")} className="md:col-span-2">
            <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-wrap gap-4">
              {(["any", "male", "female"] as const).map((g) => (
                <label key={g} className="flex min-h-11 items-center gap-2"><RadioGroupItem value={g} />{t(`enums.genderRule.${g}`)}</label>
              ))}
            </RadioGroup>
          </Fieldset>
        )} />
      </div>

      <Fieldset legend={t("admin.form.otherReq")} className="mt-5">
        <ul className="space-y-2">
          {reqs.fields.map((f, i) => (
            <li key={f.id} className="flex items-end gap-2">
              <Field id={`${id("otherRequirements")}-${i}-value`} label={`${t("admin.form.otherReq")} ${toBnDigits(i + 1)}`} className="flex-1" labelClassName="sr-only" error={e?.otherRequirements?.[i]?.value?.message}>
                <Input {...register(`posts.${index}.otherRequirements.${i}.value`)} />
              </Field>
              <Button type="button" variant="ghost" size="icon" onClick={() => reqs.remove(i)} aria-label={`${t("common.remove")} ${toBnDigits(i + 1)}`}><Trash2 aria-hidden /></Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" onClick={() => reqs.append({ value: "" })}><Plus aria-hidden />{t("admin.form.addReq")}</Button>
      </Fieldset>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Controller control={control} name={`posts.${index}.keywordsRequired`} render={({ field }) => (
          <Field id={id("kw")} label={t("admin.form.keywords")}>
            {(aria) => <MultiCombobox {...aria} allowCreate value={field.value} onChange={field.onChange} options={field.value.map((k) => ({ value: k, label: k }))} />}
          </Field>
        )} />
        <Controller control={control} name={`posts.${index}.keywordsPreferred`} render={({ field }) => (
          <Field id={id("kwp")} label={t("admin.form.keywordsPreferred")}>
            {(aria) => <MultiCombobox {...aria} allowCreate value={field.value} onChange={field.onChange} options={field.value.map((k) => ({ value: k, label: k }))} />}
          </Field>
        )} />
      </div>
    </li>
  );
}

export function CircularForm({ circular }: { circular: Circular | null }) {
  const router = useRouter();
  const { role } = useSession();
  const tax = useTaxonomy();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgDialog, setOrgDialog] = useState(false);
  const [pending, setPending] = useState<null | "draft" | "submit" | "publish">(null);
  const [conflict, setConflict] = useState(false);
  const [pdf, setPdf] = useState<DropzoneState>(circular?.noticePdfUrl ? { status: "success", fileName: "notice.pdf" } : { status: "idle" });
  const form = useForm<CircularFormInput, unknown, Out>({ resolver: zodResolver(circularSchema), defaultValues: toFormValues(circular), mode: "onTouched" });
  const posts = useFieldArray({ control: form.control, name: "posts" });
  const values = useWatch({ control: form.control });
  const { errors, isSubmitted, isDirty } = form.formState;
  const draft = useLocalDraft(circular ? `circular-${circular.id}` : "circular-new", values, { enabled: isDirty });
  useUnsavedGuard(isDirty && pending == null);

  const orgOptions = [...(tax?.organizations ?? []), ...orgs.filter((o) => !tax?.organizations.some((x) => x.id === o.id))].map((o) => ({ value: o.id, label: o.nameBn, keywords: [o.nameEn, o.shortName] }));

  const submit = (intent: "draft" | "submit" | "publish") =>
    form.handleSubmit(
      async (v) => {
        setPending(intent);
        const r = await saveCircular({ ...toDraft(v), id: circular?.id ?? null }, circular?.version ?? null, newIdempotencyKey(), intent);
        setPending(null);
        if (r.ok) {
          draft.clear();
          form.reset(form.getValues());
          toast.success(intent === "draft" ? t("admin.form.draftSaved") : r.data.status === "published" ? t("admin.form.published") : t("admin.form.submitted"));
          router.push("/admin/circulars");
        } else if (r.error.code === "CONFLICT") setConflict(true);
        else toast.error(r.error.message_bn, { description: r.error.requestId });
      },
      () => requestAnimationFrame(() => document.getElementById("error-summary")?.focus()),
    );

  return (
    <div className="pb-28">
      {draft.pendingDraft && (
        <Notice tone="info" className="mb-4" title={t("common.draftFound")} action={<div className="flex gap-2"><Button size="sm" onClick={() => { form.reset(draft.pendingDraft as CircularFormInput, { keepDefaultValues: true }); draft.acceptDraft(); }}>{t("common.restore")}</Button><Button size="sm" variant="ghost" onClick={draft.dismiss}>{t("common.discard")}</Button></div>} />
      )}
      <div className="mb-4"><ErrorSummary errors={isSubmitted ? flattenErrors(errors, labelFor) : []} /></div>
      <form noValidate className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        <Card>
          <CardHeader title={`১. ${t("admin.form.sectionOrg")}`} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Controller control={form.control} name="organizationId" render={({ field }) => (
              <Field id="organizationId" label={t("admin.form.organization")} required error={errors.organizationId?.message} className="flex-1">
                {(aria) => <Combobox {...aria} options={orgOptions} value={field.value || null} onChange={(v) => field.onChange(v ?? "")} />}
              </Field>
            )} />
            <Button type="button" variant="secondary" onClick={() => setOrgDialog(true)}><Plus aria-hidden />{t("admin.form.newOrg")}</Button>
          </div>
        </Card>

        <Card>
          <CardHeader title={`২. ${t("admin.form.sectionNotice")}`} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="noticeNo" label={t("admin.form.noticeNo")} required error={errors.noticeNo?.message}><Input {...form.register("noticeNo")} /></Field>
            <div />
            <Field id="titleBn" label={t("admin.form.titleBn")} required error={errors.titleBn?.message}><Input {...form.register("titleBn")} /></Field>
            <Field id="titleEn" label={t("admin.form.titleEn")} error={errors.titleEn?.message}><Input lang="en" {...form.register("titleEn")} /></Field>
            {(["sector", "jobType", "workMode", "applyPlatform"] as const).map((k) => (
              <Controller key={k} control={form.control} name={k} render={({ field }) => (
                <Field id={k} label={t(`admin.form.${k}`)} required>
                  {(aria) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...aria} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(k === "sector" ? ["government", "semi_government", "autonomous", "private", "ngo", "international"] : k === "jobType" ? ["full_time", "part_time", "contract", "internship"] : k === "workMode" ? ["onsite", "remote", "hybrid"] : ["teletalk", "official_site", "email", "postal"]).map((o) => (
                          <SelectItem key={o} value={o}>{t(`enums.${k}.${o}` as never)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )} />
            ))}
            <Controller control={form.control} name="startAt" render={({ field }) => (
              <Field id="startAt-date" label={t("admin.form.startAt")} required error={(errors.startAt as { date?: { message?: string } } | undefined)?.date?.message ?? errors.startAt?.message}>
                {(aria) => <DateTimeInput {...aria} value={field.value} onChange={field.onChange} />}
              </Field>
            )} />
            <Controller control={form.control} name="endAt" render={({ field }) => (
              <Field id="endAt-date" label={t("admin.form.endAt")} required error={(errors.endAt as { date?: { message?: string } } | undefined)?.date?.message ?? errors.endAt?.message}>
                {(aria) => <DateTimeInput {...aria} value={field.value} onChange={field.onChange} />}
              </Field>
            )} />
            <Controller control={form.control} name="ageReferenceDate" render={({ field }) => (
              <Field id="ageReferenceDate" label={t("admin.form.ageRef")} required error={errors.ageReferenceDate?.message}>
                {(aria) => <DateInput {...aria} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
              </Field>
            )} />
            <Field id="applicationFee" label={t("admin.form.fee")} error={errors.applicationFee?.message}><Input inputMode="numeric" {...form.register("applicationFee")} /></Field>
            <Field id="applyUrl" label={t("admin.form.applyUrl")} required error={errors.applyUrl?.message}><Input type="url" lang="en" {...form.register("applyUrl")} /></Field>
            <Field id="sourceUrl" label={t("admin.form.sourceUrl")} error={errors.sourceUrl?.message}><Input type="url" lang="en" {...form.register("sourceUrl")} /></Field>
            <Field id="descriptionBn" label={t("admin.form.description")} className="md:col-span-2"><Textarea rows={3} {...form.register("descriptionBn")} /></Field>
            <div className="md:col-span-2">
              <p className="mb-1.5 font-medium">{t("admin.form.pdf")}</p>
              <FileDropzone
                rule={CIRCULAR_FILE}
                state={pdf}
                title={t("admin.form.pdf")}
                typesLabel={t("admin.form.pdfTypes")}
                onFile={(f) => {
                  setPdf({ status: "uploading", progress: 40, fileName: f.name });
                  setTimeout(() => setPdf({ status: "success", fileName: f.name, label: t("common.saved") }), 700);
                }}
                onInvalid={(m) => setPdf({ status: "error", message: m })}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={`৩. ${t("admin.form.sectionPosts")}`} />
          {errors.posts?.message && <p className="mb-2 font-medium text-danger">⚠ {errors.posts.message}</p>}
          <ol className="space-y-4">
            {posts.fields.map((f, i) => (
              <PostEditor key={f.id} index={i} control={form.control} register={form.register} errors={errors} canRemove={posts.fields.length > 1} onRemove={() => posts.remove(i)} />
            ))}
          </ol>
          <Button type="button" variant="secondary" className="mt-4" onClick={() => posts.append(emptyPost())}><Plus aria-hidden />{t("admin.form.addPost")}</Button>
        </Card>

        <Card>
          <CardHeader title={`৪. ${t("admin.form.sectionTags")}`} />
          <div className="grid gap-4 md:grid-cols-2">
            <Controller control={form.control} name="categoryId" render={({ field }) => (
              <Field id="categoryId" label={t("admin.form.category")} required error={errors.categoryId?.message}>
                {(aria) => <Combobox {...aria} value={field.value || null} onChange={(v) => field.onChange(v ?? "")} options={(tax?.categories ?? []).map((c) => ({ value: c.id, label: c.nameBn, keywords: [c.nameEn] }))} />}
              </Field>
            )} />
            <Controller control={form.control} name="tagSlugs" render={({ field }) => (
              <Field id="tagSlugs" label={t("admin.form.tags")}>
                {(aria) => <MultiCombobox {...aria} value={field.value} onChange={field.onChange} options={(tax?.tags ?? []).map((g) => ({ value: g.slug, label: g.nameBn }))} />}
              </Field>
            )} />
            <Controller control={form.control} name="divisionId" render={({ field }) => (
              <Field id="divisionId" label={t("admin.form.division")}>
                {(aria) => <Combobox {...aria} value={field.value || null} onChange={(v) => field.onChange(v ?? "")} options={(tax?.divisions ?? []).map((d) => ({ value: d.id, label: d.nameBn, keywords: [d.nameEn] }))} />}
              </Field>
            )} />
            <Controller control={form.control} name="districtId" render={({ field }) => (
              <Field id="districtId" label={t("admin.form.district")}>
                {(aria) => <Combobox {...aria} value={field.value || null} onChange={(v) => field.onChange(v ?? "")} options={(tax?.districts ?? []).map((d) => ({ value: d.id, label: d.nameBn, keywords: [d.nameEn, ...d.aliases] }))} />}
              </Field>
            )} />
          </div>
        </Card>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 px-4 py-3 shadow-raised backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1400px] flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={pending === "draft"} disabled={pending != null} onClick={() => void submit("draft")()}><Save aria-hidden />{t("admin.form.saveDraft")}</Button>
          {role === "admin" ? (
            <Button loading={pending === "publish"} disabled={pending != null} onClick={() => void submit("publish")()}><Send aria-hidden />{t("admin.form.publish")}</Button>
          ) : (
            <Button loading={pending === "submit"} disabled={pending != null} onClick={() => void submit("submit")()}><Send aria-hidden />{t("admin.form.submitReview")}</Button>
          )}
        </div>
      </div>

      <OrgFormDialog open={orgDialog} onOpenChange={setOrgDialog} org={null} onSaved={(o) => { setOrgs((xs) => [...xs, o]); form.setValue("organizationId", o.id, { shouldDirty: true }); }} />
      <ConflictDialog open={conflict} onOpenChange={setConflict} onReload={() => window.location.reload()} changes={[{ field: t("admin.form.sectionNotice"), yours: t("states.conflictYours"), theirs: t("states.conflictTheirs") }]} />
    </div>
  );
}
