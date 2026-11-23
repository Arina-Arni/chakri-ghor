"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ConflictDialog } from "@/components/feedback/conflict-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { useSession } from "@/components/providers/session-provider";
import { BasicInfoForm, CompletenessRing, CvExperienceForm, EducationSkillsForm } from "@/components/profile/profile-forms";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getProfile, updateProfile } from "@/data";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { messages, t } from "@/i18n";
import type { Profile } from "@/types";

export function ProfileScreen() {
  const q = useData(() => getProfile(), []);
  const { refresh } = useSession();
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [formsKey, setFormsKey] = useState(0);

  if (q.status === "loading") return <FormSkeleton fields={6} />;
  if (q.status === "error") return <ErrorState error={q.error} onRetry={q.reload} />;
  const p = q.data;

  const save = (section: string) => async (patch: Partial<Profile>) => {
    setSaving(section);
    const r = await updateProfile(patch, p.version, newIdempotencyKey());
    setSaving(null);
    if (!r.ok) {
      if (r.error.code === "CONFLICT") setConflict(true);
      else toast.error(r.error.message_bn, { description: r.error.requestId });
      return false;
    }
    q.setData(r.data);
    toast.success(t("profile.updated"));
    void refresh();
    return true;
  };

  const sections = [
    { id: "basic", title: t("profile.basic"), form: <BasicInfoForm formId="pf-basic" profile={p} onSubmit={save("basic")} draftKey="profile-basic" /> },
    { id: "pro", title: t("profile.professional"), form: <CvExperienceForm formId="pf-pro" profile={p} onSubmit={save("pro")} draftKey="profile-pro" showCv={false} /> },
    { id: "edu", title: messages.onboarding.steps[2], form: <EducationSkillsForm formId="pf-edu" profile={p} onSubmit={save("edu")} draftKey="profile-edu" /> },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("profile.title")} />
      <Card className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <CompletenessRing pct={p.completeness} />
        <div>
          <h2 className="text-lg font-semibold">{t("profile.completenessTitle", { pct: p.completeness })}</h2>
          {p.missingItems.length ? (
            <>
              <p className="text-muted-foreground">{t("profile.missing")}</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {p.missingItems.map((m) => (
                  <li key={m} className="rounded-full bg-warning-soft px-3 py-0.5 text-sm text-warning">{m}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-1 text-success"><CheckCircle2 className="size-4" aria-hidden />{t("profile.complete")}</p>
          )}
        </div>
      </Card>
      <div className="space-y-6" key={formsKey}>
        {sections.map((s) => (
          <Card key={s.id} aria-labelledby={`sec-${s.id}`}>
            <CardHeader id={`sec-${s.id}`} title={s.title} />
            {s.form}
            <div className="mt-5 flex justify-end border-t pt-4">
              <Button type="submit" form={`pf-${s.id}`} loading={saving === s.id}>{t("common.save")}</Button>
            </div>
          </Card>
        ))}
      </div>
      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        changes={[{ field: t("profile.title"), yours: "আপনার সম্পাদনা", theirs: "অন্য ডিভাইস থেকে সেভ করা সংস্করণ" }]}
        onReload={() => {
          setConflict(false);
          void q.reload().then(() => setFormsKey((k) => k + 1));
        }}
      />
    </div>
  );
}
