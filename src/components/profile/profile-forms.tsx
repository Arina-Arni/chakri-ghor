"use client";

import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type FieldErrors, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, CheckCheck, HelpCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { AiProgress } from "@/components/feedback/ai-status";
import { Notice } from "@/components/feedback/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, MultiCombobox, type ComboOption } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { ErrorSummary, Field, Fieldset } from "@/components/ui/field";
import { FileDropzone, type DropzoneState } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { uploadCv } from "@/data";
import { formatDateInput, toBnDigits } from "@/domain/bn";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { useLocalDraft } from "@/hooks/use-local-draft";
import { useTaxonomy } from "@/hooks/use-taxonomy";
import { t } from "@/i18n";
import { flattenErrors } from "@/lib/form";
import { cn } from "@/lib/utils";
import {
  profileStep1Schema,
  profileStep2Schema,
  profileStep3Schema,
  type ProfileStep1Input,
  type ProfileStep1Output,
  type ProfileStep2Input,
  type ProfileStep2Output,
  type ProfileStep3Input,
  type ProfileStep3Output,
} from "@/schemas/profile";
import { CV_FILE } from "@/schemas/common";
import { EDUCATION_LEVELS, type Profile } from "@/types";

export type SubmitPatch = (patch: Partial<Profile>) => Promise<boolean>;

const SPECIAL = ["freedom_fighter_family", "ethnic_minority", "disability", "orphan", "ansar_vdp"] as const;
const SECTORS = ["government", "semi_government", "autonomous", "private", "ngo", "international"] as const;
const JOB_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
const WORK_MODES = ["onsite", "remote", "hybrid"] as const;
const SKILL_SUGGESTIONS = ["Computer Typing", "Bangla Typing", "MS Office", "Microsoft Excel", "Data Entry", "Record Keeping", "Communication", "Customer Service", "Accounting", "Teaching", "Driving", "React", "TypeScript", "JavaScript", "Graphic Design", "Figma", "AutoCAD", "Nursing"];

let uid = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}${(uid++).toString(36)}`;

function focusSummary() {
  requestAnimationFrame(() => document.getElementById("error-summary")?.focus());
}

function useDistrictOptions(): ComboOption[] {
  const tax = useTaxonomy();
  return (tax?.districts ?? []).map((d) => ({ value: d.id, label: d.nameBn, keywords: [d.nameEn, ...d.aliases] }));
}

/** Purple left border + label for fields AI filled that the user hasn't confirmed. */
function AiFilled({ on, children }: { on: boolean; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <div className="rounded-r-lg border-l-4 border-ai bg-ai-soft/30 py-2 pl-3">
      <p className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-ai">
        <Sparkles className="size-3.5" aria-hidden />
        {t("onboarding.aiFilled")}
      </p>
      {children}
    </div>
  );
}

function DraftPrompt<T>({ draft, onRestore, onDiscard }: { draft: T | null; onRestore: (v: T) => void; onDiscard: () => void }) {
  if (!draft) return null;
  return (
    <Notice
      tone="info"
      live
      title={t("common.draftFound")}
      action={
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRestore(draft)}>{t("common.restore")}</Button>
          <Button size="sm" variant="ghost" onClick={onDiscard}>{t("common.discard")}</Button>
        </div>
      }
    />
  );
}

function Summary<T extends FieldValues>({ errors, submitted, labels }: { errors: FieldErrors<T>; submitted: boolean; labels: (p: string) => string }) {
  return <ErrorSummary errors={submitted ? flattenErrors(errors, labels) : []} />;
}

// ───────── Step 1: basic info ─────────

const L1: Record<string, string> = {
  fullName: t("onboarding.fullName"),
  dateOfBirth: t("onboarding.dob"),
  gender: t("onboarding.gender"),
  phone: t("onboarding.phone"),
  homeDistrictId: t("onboarding.homeDistrict"),
  currentDistrictId: t("onboarding.currentDistrict"),
};

export function BasicInfoForm({ formId, profile, onSubmit, draftKey }: { formId: string; profile: Profile; onSubmit: SubmitPatch; draftKey: string }) {
  const districts = useDistrictOptions();
  const defaults: ProfileStep1Input = {
    fullName: profile.fullName,
    dateOfBirth: formatDateInput(profile.dateOfBirth),
    gender: (profile.gender ?? undefined) as ProfileStep1Input["gender"],
    phone: profile.phone ? toBnDigits(profile.phone) : "",
    homeDistrictId: profile.homeDistrictId ?? "",
    currentDistrictId: profile.currentDistrictId ?? "",
    specialCategories: profile.specialCategories,
  };
  const form = useForm<ProfileStep1Input, unknown, ProfileStep1Output>({ resolver: zodResolver(profileStep1Schema), defaultValues: defaults, mode: "onTouched" });
  const values = useWatch({ control: form.control });
  const draft = useLocalDraft(draftKey, values, { enabled: form.formState.isDirty });
  const { errors, isSubmitted } = form.formState;

  return (
    <div className="space-y-5">
      <DraftPrompt draft={draft.pendingDraft} onRestore={(v) => { form.reset(v as ProfileStep1Input, { keepDefaultValues: true }); draft.acceptDraft(); }} onDiscard={draft.dismiss} />
      <Summary errors={errors} submitted={isSubmitted} labels={(p) => L1[p] ?? p} />
      <form
        id={formId}
        noValidate
        className="grid gap-5 md:grid-cols-2"
        onSubmit={form.handleSubmit(async (v) => {
          const ok = await onSubmit({ ...v, gender: v.gender });
          if (ok) {
            draft.clear();
            form.reset(form.getValues());
          }
        }, focusSummary)}
      >
        <Field id="fullName" label={L1.fullName} required error={errors.fullName?.message} className="md:col-span-2">
          <Input autoComplete="name" {...form.register("fullName")} />
        </Field>
        <Controller control={form.control} name="dateOfBirth" render={({ field }) => (
          <Field id="dateOfBirth" label={L1.dateOfBirth} required hint={t("onboarding.dobHint")} error={errors.dateOfBirth?.message}>
            {(aria) => <DateInput {...aria} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
          </Field>
        )} />
        <Field id="phone" label={L1.phone} required error={errors.phone?.message} hint="০১৭১২৩৪৫৬৭৮ বা +৮৮০…">
          <Input type="tel" inputMode="tel" autoComplete="tel" {...form.register("phone")} />
        </Field>
        <Controller control={form.control} name="gender" render={({ field }) => (
          <Fieldset id="gender" legend={<>{L1.gender} <span className="text-sm font-normal text-muted-foreground">{t("common.requiredMark")}</span></>} error={errors.gender?.message} className="md:col-span-2">
            <RadioGroup value={field.value ?? ""} onValueChange={field.onChange} className="flex flex-wrap gap-4" aria-invalid={!!errors.gender}>
              {(["female", "male", "third_gender"] as const).map((g) => (
                <label key={g} className="flex min-h-11 items-center gap-2">
                  <RadioGroupItem value={g} id={g === "female" ? "gender" : `gender-${g}`} />
                  {t(`enums.gender.${g}`)}
                </label>
              ))}
            </RadioGroup>
          </Fieldset>
        )} />
        <Controller control={form.control} name="homeDistrictId" render={({ field }) => (
          <Field id="homeDistrictId" label={L1.homeDistrictId} required error={errors.homeDistrictId?.message}>
            {(aria) => <Combobox {...aria} options={districts} value={field.value || null} onChange={(v) => field.onChange(v ?? "")} />}
          </Field>
        )} />
        <Controller control={form.control} name="currentDistrictId" render={({ field }) => (
          <Field id="currentDistrictId" label={L1.currentDistrictId} required error={errors.currentDistrictId?.message}>
            {(aria) => <Combobox {...aria} options={districts} value={field.value || null} onChange={(v) => field.onChange(v ?? "")} />}
          </Field>
        )} />
        <Controller control={form.control} name="specialCategories" render={({ field }) => (
          <Fieldset
            className="md:col-span-2"
            legend={
              <span className="inline-flex items-center gap-2">
                {t("onboarding.specialCategories")} <span className="text-sm font-normal text-muted-foreground">({t("common.optional")})</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="inline-flex min-h-9 items-center gap-1 text-sm font-normal text-primary underline-offset-4 hover:underline">
                      <HelpCircle className="size-4" aria-hidden />
                      {t("onboarding.whyAsk")}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="max-w-xs text-sm">{t("onboarding.whyAskBody")}</PopoverContent>
                </Popover>
              </span>
            }
          >
            <div className="grid gap-1 sm:grid-cols-2">
              {SPECIAL.map((s) => (
                <label key={s} className="flex min-h-11 items-center gap-3">
                  <Checkbox checked={field.value.includes(s)} onCheckedChange={(c) => field.onChange(c ? [...field.value, s] : field.value.filter((x) => x !== s))} />
                  {t(`enums.specialCategory.${s}`)}
                </label>
              ))}
            </div>
          </Fieldset>
        )} />
      </form>
    </div>
  );
}

// ───────── Step 2: CV & experience ─────────

const L2 = (p: string) => {
  if (p === "headline") return t("onboarding.headline");
  if (p === "summary") return t("onboarding.summary");
  const m = /^(links|experiences)\.(\d+)\.(\w+)/.exec(p);
  if (m) {
    const n = toBnDigits(Number(m[2]) + 1);
    const map: Record<string, string> = { label: t("onboarding.linkLabel"), url: t("onboarding.linkUrl"), title: t("onboarding.expTitle"), organization: t("onboarding.expOrg"), startDate: t("onboarding.expStart"), endDate: t("onboarding.expEnd") };
    return `${m[1] === "links" ? t("onboarding.links") : t("onboarding.experiences")} ${n} — ${map[m[3]] ?? m[3]}`;
  }
  return p;
};

function toStep2(p: Pick<Profile, "headline" | "summary" | "links" | "experiences">): ProfileStep2Input {
  return {
    headline: p.headline,
    summary: p.summary,
    links: p.links,
    experiences: p.experiences.map((e) => ({
      id: e.id,
      title: e.title,
      organization: e.organization,
      startDate: formatDateInput(e.startDate),
      endDate: formatDateInput(e.endDate),
      current: e.current,
      bulletsText: e.bullets.join("\n"),
    })),
  };
}

function fromStep2(v: ProfileStep2Output): Partial<Profile> {
  return {
    headline: v.headline,
    summary: v.summary,
    links: v.links.filter((l) => l.url),
    experiences: v.experiences.map((e) => ({
      id: e.id,
      title: e.title,
      organization: e.organization,
      startDate: e.startDate,
      endDate: e.current ? null : e.endDate,
      current: e.current,
      bullets: e.bulletsText.split("\n").map((s) => s.trim()).filter(Boolean),
    })),
    aiFilledFields: [],
  };
}

export function CvExperienceForm({ formId, profile, onSubmit, draftKey, showCv = true }: { formId: string; profile: Profile; onSubmit: SubmitPatch; draftKey: string; showCv?: boolean }) {
  const form = useForm<ProfileStep2Input, unknown, ProfileStep2Output>({ resolver: zodResolver(profileStep2Schema), defaultValues: toStep2(profile), mode: "onTouched" });
  const links = useFieldArray({ control: form.control, name: "links" });
  const exps = useFieldArray({ control: form.control, name: "experiences", keyName: "_key" });
  const values = useWatch({ control: form.control });
  const draft = useLocalDraft(draftKey, values, { enabled: form.formState.isDirty });
  const { errors, isSubmitted } = form.formState;
  const [consent, setConsent] = useState(false);
  const [cv, setCv] = useState<DropzoneState>({ status: "idle" });
  const [aiFields, setAiFields] = useState<string[]>(profile.aiFilledFields);
  const [partial, setPartial] = useState(false);
  const clearAi = (f: string) => setAiFields((xs) => xs.filter((x) => x !== f));

  const onFile = async (file: File) => {
    setPartial(false);
    setCv({ status: "uploading", progress: 0, fileName: file.name });
    const r = await uploadCv(file, newIdempotencyKey(), {
      onProgress: (pct) => setCv(pct >= 100 ? { status: "processing", fileName: file.name } : { status: "uploading", progress: pct, fileName: file.name }),
    });
    if (!r.ok) {
      setCv({ status: "error", fileName: file.name, message: r.error.message_bn });
      return;
    }
    const x = r.data.extracted;
    const cur = form.getValues();
    form.reset(
      {
        ...cur,
        headline: x.headline ?? cur.headline,
        summary: x.summary ?? cur.summary,
        links: x.links?.length ? x.links : cur.links,
        experiences: x.experiences?.length ? toStep2({ headline: "", summary: "", links: [], experiences: x.experiences }).experiences : cur.experiences,
      },
      { keepDefaultValues: true },
    );
    form.trigger();
    if (r.data.status === "partial") {
      setPartial(true);
      setAiFields([]);
      setCv({ status: "error", fileName: file.name, message: t("onboarding.cvFailed") });
    } else {
      setAiFields(r.data.aiFilledFields);
      setCv({ status: "success", fileName: file.name, label: t("onboarding.cvSuccess") });
    }
  };



  return (
    <div className="space-y-5">
      <DraftPrompt draft={draft.pendingDraft} onRestore={(v) => { form.reset(v as ProfileStep2Input, { keepDefaultValues: true }); draft.acceptDraft(); }} onDiscard={draft.dismiss} />
      <Summary errors={errors} submitted={isSubmitted} labels={L2} />

      {showCv && (
        <section aria-labelledby="cv-h" className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <h3 id="cv-h" className="text-lg font-semibold">{t("onboarding.cvTitle")}</h3>
          <label className="flex items-start gap-3">
            <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-1" aria-describedby="cv-consent-hint" />
            <span>
              {t("onboarding.cvConsent")} <span className="text-sm text-muted-foreground">{t("common.requiredMark")}</span>
            </span>
          </label>
          <p id="cv-consent-hint" className="sr-only">{t("validation.consentRequired")}</p>
          <FileDropzone rule={CV_FILE} state={cv} disabled={!consent} onFile={(f) => void onFile(f)} onInvalid={(m) => setCv({ status: "error", message: m })} />
          {!consent && <p className="text-sm text-muted-foreground">{t("validation.consentRequired")}</p>}
          {cv.status === "processing" && <AiProgress text={t("onboarding.cvReading")} />}
          {partial && <Notice tone="warning" live title={t("onboarding.cvFailed")}>{t("onboarding.cvFailedFound")}</Notice>}
          {aiFields.length > 0 && (
            <Notice tone="ai" live title={t("onboarding.cvSuccess")} action={<Button size="sm" variant="secondary" onClick={() => setAiFields([])}><CheckCheck aria-hidden />{t("onboarding.cvAllGood")}</Button>} />
          )}
          <p className="text-sm text-muted-foreground">ডেমো: ফাইলের নামে “scan” থাকলে পড়া ব্যর্থ হবে, “locked” থাকলে পাসওয়ার্ড-সুরক্ষিত PDF দেখাবে।</p>
        </section>
      )}

      <form id={formId} noValidate className="space-y-5" onSubmit={form.handleSubmit(async (v) => {
        const ok = await onSubmit(fromStep2(v));
        if (ok) {
          draft.clear();
          setAiFields([]);
          form.reset(form.getValues());
        }
      }, focusSummary)}>
        <AiFilled on={aiFields.includes("headline")}>
          <Field id="headline" label={t("onboarding.headline")} hint={t("onboarding.headlineHint")} error={errors.headline?.message}>
            <Input {...form.register("headline")} onFocus={() => clearAi("headline")} />
          </Field>
        </AiFilled>
        <AiFilled on={aiFields.includes("summary")}>
          <Field id="summary" label={t("onboarding.summary")} error={errors.summary?.message}>
            <Textarea rows={4} {...form.register("summary")} onFocus={() => clearAi("summary")} />
          </Field>
        </AiFilled>

        <Fieldset legend={t("onboarding.links")}>
          <ul className="space-y-3">
            {links.fields.map((f, i) => (
              <li key={f.id} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                <Field id={`links-${i}-label`} label={t("onboarding.linkLabel")} error={errors.links?.[i]?.label?.message}>
                  <Input {...form.register(`links.${i}.label`)} />
                </Field>
                <Field id={`links-${i}-url`} label={t("onboarding.linkUrl")} error={errors.links?.[i]?.url?.message}>
                  <Input type="url" inputMode="url" {...form.register(`links.${i}.url`)} />
                </Field>
                <Button type="button" variant="ghost" size="icon" className="self-end" onClick={() => links.remove(i)} aria-label={`${t("onboarding.remove")} ${t("onboarding.links")} ${toBnDigits(i + 1)}`}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {links.fields.length < 5 && (
            <Button type="button" variant="ghost" onClick={() => links.append({ label: "", url: "" })}>
              <Plus aria-hidden />
              {t("onboarding.addLink")}
            </Button>
          )}
        </Fieldset>

        <AiFilled on={aiFields.includes("experiences")}>
          <Fieldset legend={t("onboarding.experiences")}>
            <div onFocusCapture={() => clearAi("experiences")} className="contents">
            <ol className="space-y-4">
              {exps.fields.map((f, i) => {
                const e = errors.experiences?.[i];
                const current = values.experiences?.[i]?.current;
                return (
                  <li key={f._key} className="rounded-xl border bg-surface p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="font-semibold">{t("onboarding.experiences")} {t("onboarding.itemN", { n: i + 1 })}</p>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => exps.move(i, i - 1)} aria-label={`${t("onboarding.moveUp")} — ${toBnDigits(i + 1)}`}><ArrowUp aria-hidden /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" disabled={i === exps.fields.length - 1} onClick={() => exps.move(i, i + 1)} aria-label={`${t("onboarding.moveDown")} — ${toBnDigits(i + 1)}`}><ArrowDown aria-hidden /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => exps.remove(i)} aria-label={`${t("onboarding.remove")} — ${toBnDigits(i + 1)}`}><Trash2 aria-hidden /></Button>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field id={`experiences-${i}-title`} label={t("onboarding.expTitle")} required error={e?.title?.message}>
                        <Input {...form.register(`experiences.${i}.title`)} />
                      </Field>
                      <Field id={`experiences-${i}-organization`} label={t("onboarding.expOrg")} required error={e?.organization?.message}>
                        <Input {...form.register(`experiences.${i}.organization`)} />
                      </Field>
                      <Controller control={form.control} name={`experiences.${i}.startDate`} render={({ field }) => (
                        <Field id={`experiences-${i}-startDate`} label={t("onboarding.expStart")} required error={e?.startDate?.message}>
                          {(aria) => <DateInput {...aria} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                        </Field>
                      )} />
                      <Controller control={form.control} name={`experiences.${i}.endDate`} render={({ field }) => (
                        <Field id={`experiences-${i}-endDate`} label={t("onboarding.expEnd")} required={!current} error={e?.endDate?.message}>
                          {(aria) => <DateInput {...aria} value={field.value} onChange={field.onChange} onBlur={field.onBlur} disabled={!!current} />}
                        </Field>
                      )} />
                      <Controller control={form.control} name={`experiences.${i}.current`} render={({ field }) => (
                        <label className="flex min-h-11 items-center gap-3 md:col-span-2">
                          <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                          {t("onboarding.expCurrent")}
                        </label>
                      )} />
                      <Field id={`experiences-${i}-bulletsText`} label={t("onboarding.expBullets")} className="md:col-span-2">
                        <Textarea rows={3} {...form.register(`experiences.${i}.bulletsText`)} />
                      </Field>
                    </div>
                  </li>
                );
              })}
            </ol>
            <Button type="button" variant="secondary" onClick={() => exps.append({ id: newId("exp"), title: "", organization: "", startDate: "", endDate: "", current: false, bulletsText: "" })}>
              <Plus aria-hidden />
              {t("onboarding.addExperience")}
            </Button>
            </div>
          </Fieldset>
        </AiFilled>
      </form>
    </div>
  );
}

// ───────── Step 3: education, skills, preferences ─────────

const L3 = (p: string) => {
  const m = /^educations\.(\d+)\.(\w+)/.exec(p);
  if (m) {
    const map: Record<string, string> = { level: t("onboarding.eduLevel"), degreeName: t("onboarding.eduDegree"), institution: t("onboarding.eduInstitution"), passingYear: t("onboarding.eduYear") };
    return `${t("onboarding.educations")} ${toBnDigits(Number(m[1]) + 1)} — ${map[m[2]] ?? m[2]}`;
  }
  if (p === "educations") return t("onboarding.educations");
  if (p.startsWith("preferences.minSalary")) return t("onboarding.prefMinSalary");
  return p;
};

export function EducationSkillsForm({ formId, profile, onSubmit, draftKey }: { formId: string; profile: Profile; onSubmit: SubmitPatch; draftKey: string }) {
  const tax = useTaxonomy();
  const districts = useDistrictOptions();
  const defaults: ProfileStep3Input = {
    educations: profile.educations.map((e) => ({ ...e, board: e.board ?? "", passingYear: toBnDigits(e.passingYear) })),
    skills: profile.skills,
    preferences: { ...profile.preferences, minSalary: profile.preferences.minSalary ? toBnDigits(profile.preferences.minSalary) : "" },
  };
  const form = useForm<ProfileStep3Input, unknown, ProfileStep3Output>({ resolver: zodResolver(profileStep3Schema), defaultValues: defaults, mode: "onTouched" });
  const edus = useFieldArray({ control: form.control, name: "educations", keyName: "_key" });
  const values = useWatch({ control: form.control });
  const draft = useLocalDraft(draftKey, values, { enabled: form.formState.isDirty });
  const { errors, isSubmitted } = form.formState;
  const checkGroup = <K extends "sectors" | "jobTypes" | "workModes">(key: K, opts: readonly string[], label: (v: string) => string, legend: string) => (
    <Controller control={form.control} name={`preferences.${key}`} render={({ field }) => (
      <Fieldset legend={legend}>
        <div className="flex flex-wrap gap-x-5">
          {opts.map((o) => (
            <label key={o} className="flex min-h-11 items-center gap-2">
              <Checkbox checked={field.value.includes(o)} onCheckedChange={(c) => field.onChange(c ? [...field.value, o] : field.value.filter((x) => x !== o))} />
              {label(o)}
            </label>
          ))}
        </div>
      </Fieldset>
    )} />
  );

  return (
    <div className="space-y-5">
      <DraftPrompt draft={draft.pendingDraft} onRestore={(v) => { form.reset(v as ProfileStep3Input, { keepDefaultValues: true }); draft.acceptDraft(); }} onDiscard={draft.dismiss} />
      <Summary errors={errors} submitted={isSubmitted} labels={L3} />
      <form id={formId} noValidate className="space-y-6" onSubmit={form.handleSubmit(async (v) => {
        const ok = await onSubmit({
          educations: v.educations.map((e) => ({ ...e, board: e.board || null })),
          skills: v.skills,
          preferences: { ...v.preferences, sectors: v.preferences.sectors as Profile["preferences"]["sectors"], jobTypes: v.preferences.jobTypes as Profile["preferences"]["jobTypes"], workModes: v.preferences.workModes as Profile["preferences"]["workModes"] },
        });
        if (ok) {
          draft.clear();
          form.reset(form.getValues());
        }
      }, focusSummary)}>
        <Fieldset id="educations" legend={<>{t("onboarding.educations")} <span className="text-sm font-normal text-muted-foreground">{t("common.requiredMark")}</span></>} error={errors.educations?.root?.message ?? errors.educations?.message}>
          <ol className="space-y-4">
            {edus.fields.map((f, i) => {
              const e = errors.educations?.[i];
              return (
                <li key={f._key} className="rounded-xl border bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-semibold">{t("onboarding.educations")} {t("onboarding.itemN", { n: i + 1 })}</p>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => edus.remove(i)} aria-label={`${t("onboarding.remove")} — ${toBnDigits(i + 1)}`}><Trash2 aria-hidden /></Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Controller control={form.control} name={`educations.${i}.level`} render={({ field }) => (
                      <Field id={`educations-${i}-level`} label={t("onboarding.eduLevel")} required error={e?.level?.message}>
                        {(aria) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger {...aria} className="w-full"><SelectValue placeholder={t("common.selectPlaceholder")} /></SelectTrigger>
                            <SelectContent>{EDUCATION_LEVELS.map((l) => <SelectItem key={l} value={l}>{t(`enums.education.${l}`)}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                      </Field>
                    )} />
                    <Field id={`educations-${i}-degreeName`} label={t("onboarding.eduDegree")} required error={e?.degreeName?.message}><Input {...form.register(`educations.${i}.degreeName`)} /></Field>
                    <Field id={`educations-${i}-subject`} label={t("onboarding.eduSubject")} error={e?.subject?.message}><Input {...form.register(`educations.${i}.subject`)} /></Field>
                    <Field id={`educations-${i}-institution`} label={t("onboarding.eduInstitution")} required error={e?.institution?.message} className="md:col-span-2"><Input {...form.register(`educations.${i}.institution`)} /></Field>
                    <Field id={`educations-${i}-board`} label={t("onboarding.eduBoard")} error={e?.board?.message}><Input {...form.register(`educations.${i}.board`)} /></Field>
                    <Field id={`educations-${i}-passingYear`} label={t("onboarding.eduYear")} required error={e?.passingYear?.message}><Input inputMode="numeric" {...form.register(`educations.${i}.passingYear`)} /></Field>
                    <Field id={`educations-${i}-result`} label={t("onboarding.eduResult")} error={e?.result?.message}><Input {...form.register(`educations.${i}.result`)} /></Field>
                  </div>
                </li>
              );
            })}
          </ol>
          <Button type="button" variant="secondary" onClick={() => edus.append({ id: newId("edu"), level: "hsc", degreeName: "", subject: "", institution: "", board: "", passingYear: "", result: "" })}>
            <Plus aria-hidden />
            {t("onboarding.addEducation")}
          </Button>
        </Fieldset>

        <Controller control={form.control} name="skills" render={({ field }) => (
          <Field id="skills" label={t("onboarding.skills")} hint={t("onboarding.skillsHint")}>
            {(aria) => <MultiCombobox {...aria} allowCreate value={field.value} onChange={field.onChange} options={SKILL_SUGGESTIONS.map((s) => ({ value: s, label: s }))} placeholder={t("onboarding.skills")} />}
          </Field>
        )} />

        <section aria-labelledby="pref-h" className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <h3 id="pref-h" className="text-lg font-semibold">{t("onboarding.preferences")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Controller control={form.control} name="preferences.categoryIds" render={({ field }) => (
              <Field id="pref-cat" label={t("onboarding.prefCategories")}>
                {(aria) => <MultiCombobox {...aria} value={field.value} onChange={field.onChange} options={(tax?.categories ?? []).map((c) => ({ value: c.id, label: c.nameBn, keywords: [c.nameEn] }))} />}
              </Field>
            )} />
            <Controller control={form.control} name="preferences.districtIds" render={({ field }) => (
              <Field id="pref-dis" label={t("onboarding.prefDistricts")}>
                {(aria) => <MultiCombobox {...aria} value={field.value} onChange={field.onChange} options={districts} />}
              </Field>
            )} />
          </div>
          {checkGroup("sectors", SECTORS, (v) => t(`enums.sector.${v as (typeof SECTORS)[number]}`), t("onboarding.prefSectors"))}
          {checkGroup("jobTypes", JOB_TYPES, (v) => t(`enums.jobType.${v as (typeof JOB_TYPES)[number]}`), t("onboarding.prefJobTypes"))}
          {checkGroup("workModes", WORK_MODES, (v) => t(`enums.workMode.${v as (typeof WORK_MODES)[number]}`), t("onboarding.prefWorkModes"))}
          <Field id="preferences-minSalary" label={t("onboarding.prefMinSalary")} error={errors.preferences?.minSalary?.message} className="max-w-xs">
            <Input inputMode="numeric" placeholder="৳" {...form.register("preferences.minSalary")} />
          </Field>
        </section>
      </form>
    </div>
  );
}

/** Small % ring used for profile completeness. */
export function CompletenessRing({ pct, size = 96 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div role="img" aria-label={`${t("onboarding.completeness")}: ${toBnDigits(pct)}%`} className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0f766e" strokeWidth={8} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className={cn("absolute inset-0 grid place-items-center font-bold tabular-nums")} aria-hidden>{toBnDigits(pct)}%</span>
    </div>
  );
}
