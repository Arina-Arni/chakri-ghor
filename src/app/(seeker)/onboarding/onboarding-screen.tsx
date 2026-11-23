"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { useSession } from "@/components/providers/session-provider";
import { BasicInfoForm, CompletenessRing, CvExperienceForm, EducationSkillsForm } from "@/components/profile/profile-forms";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { getProfile, saveOnboardingStep } from "@/data";
import { formatDateBn, toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { useTaxonomy } from "@/hooks/use-taxonomy";
import { messages, t } from "@/i18n";
import type { OnboardingStep, Profile } from "@/types";

function ReviewCard({ title, step, onEdit, children }: { title: string; step: number; onEdit: (s: number) => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-surface p-4 shadow-card" aria-labelledby={`rev-${step}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id={`rev-${step}`} className="font-semibold">{title}</h3>
        <Button variant="ghost" size="sm" onClick={() => onEdit(step)} aria-label={`${t("common.edit")}: ${title}`}>
          <Pencil aria-hidden />
          {t("common.edit")}
        </Button>
      </div>
      <div className="text-muted-foreground">{children}</div>
    </section>
  );
}

export function OnboardingScreen() {
  const q = useData(() => getProfile(), []);
  const router = useRouter();
  const { refresh } = useSession();
  const tax = useTaxonomy();
  const [step, setStep] = useState<OnboardingStep | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  if (q.status === "loading") return <FormSkeleton fields={6} />;
  if (q.status === "error") return <ErrorState error={q.error} onRetry={q.reload} />;

  const profile = q.data;
  const current = step ?? (profile.onboardingCompleted ? 1 : profile.onboardingStep);
  const formId = `onboarding-step-${current}`;

  const submit = (s: OnboardingStep) => async (patch: Partial<Profile>) => {
    setSaving(true);
    const r = await saveOnboardingStep(s, patch, newIdempotencyKey());
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error.message_bn);
      return false;
    }
    q.setData(r.data);
    setSavedAt(Date.now());
    if (s < 4) {
      setStep((s + 1) as OnboardingStep);
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0 });
        document.getElementById("step-title")?.focus();
      });
    }
    return true;
  };

  const finish = async () => {
    const ok = await submit(4)({});
    if (ok) {
      toast.success(t("onboarding.done"));
      await refresh();
      router.push("/dashboard");
    }
  };

  const districtName = (id: string | null) => tax?.districts.find((d) => d.id === id)?.nameBn ?? "—";

  return (
    <div className="mx-auto max-w-3xl pb-24 lg:pb-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">{t("onboarding.title")}</h1>
        <p role="status" aria-live="polite" className="text-sm font-medium text-success">
          {saving ? <span className="text-muted-foreground">{t("onboarding.savingIndicator")}</span> : savedAt ? t("onboarding.savedIndicator") : ""}
        </p>
      </div>
      <Stepper steps={messages.onboarding.steps} current={current} maxReached={Math.max(profile.onboardingStep, current)} onStepClick={(n) => setStep(n as OnboardingStep)} label={t("onboarding.title")} />
      <p className="mt-2 text-sm text-muted-foreground sm:hidden">{t("onboarding.stepOf", { n: current })} — {messages.onboarding.steps[current - 1]}</p>

      <section className="mt-6 rounded-xl border bg-surface p-4 shadow-card md:p-6" aria-labelledby="step-title">
        <h2 id="step-title" tabIndex={-1} className="mb-4 text-xl font-semibold outline-none">
          {toBnDigits(current)}. {messages.onboarding.steps[current - 1]}
        </h2>
        {current === 1 && <BasicInfoForm key="s1" formId={formId} profile={profile} onSubmit={submit(1)} draftKey="onboarding-1" />}
        {current === 2 && <CvExperienceForm key="s2" formId={formId} profile={profile} onSubmit={submit(2)} draftKey="onboarding-2" />}
        {current === 3 && <EducationSkillsForm key="s3" formId={formId} profile={profile} onSubmit={submit(3)} draftKey="onboarding-3" />}
        {current === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl bg-primary-soft p-4">
              <CompletenessRing pct={profile.completeness} />
              <div>
                <p className="font-semibold text-ink">{t("onboarding.completeness")}</p>
                {profile.missingItems.length > 0 && <p className="text-sm text-muted-foreground">{t("profile.missing")} {profile.missingItems.join(", ")}</p>}
              </div>
            </div>
            <p>{t("onboarding.reviewTitle")}</p>
            <ReviewCard title={messages.onboarding.steps[0]} step={1} onEdit={(s) => setStep(s as OnboardingStep)}>
              {profile.fullName} · {profile.dateOfBirth ? formatDateBn(profile.dateOfBirth) : "—"} · {profile.phone ? toBnDigits(profile.phone) : "—"} · {districtName(profile.homeDistrictId)}
            </ReviewCard>
            <ReviewCard title={messages.onboarding.steps[1]} step={2} onEdit={(s) => setStep(s as OnboardingStep)}>
              {profile.headline || "—"} · {t("common.count", { n: profile.experiences.length })} {t("onboarding.experiences")}
            </ReviewCard>
            <ReviewCard title={messages.onboarding.steps[2]} step={3} onEdit={(s) => setStep(s as OnboardingStep)}>
              {profile.educations.map((e) => e.degreeName).join(", ") || "—"} · {profile.skills.slice(0, 5).join(", ")}
            </ReviewCard>
          </div>
        )}
      </section>

      <p className="mt-3 text-sm text-muted-foreground">{t("onboarding.resumeHint")}</p>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-surface/95 px-4 py-3 backdrop-blur lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          {current > 1 ? (
            <Button variant="secondary" onClick={() => setStep((current - 1) as OnboardingStep)} disabled={saving}>
              <ArrowLeft aria-hidden />
              {t("common.back")}
            </Button>
          ) : (
            <Button asChild variant="ghost"><Link href="/dashboard">{t("common.cancel")}</Link></Button>
          )}
          {current < 4 ? (
            <Button type="submit" form={formId} loading={saving}>
              {t("common.next")}
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button onClick={() => void finish()} loading={saving}>
              <Check aria-hidden />
              {t("onboarding.confirm")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
