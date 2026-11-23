"use client";

import { CircularForm } from "@/components/admin/circular-form";
import { ErrorState } from "@/components/feedback/error-state";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminCircular } from "@/data";
import { useData } from "@/hooks/use-data";
import { t } from "@/i18n";

export function CircularNew() {
  return (
    <>
      <PageHeader title={t("admin.circulars.newTitle")} back={{ href: "/admin/circulars", label: t("admin.circulars.title") }} />
      <CircularForm circular={null} />
    </>
  );
}

export function CircularEdit({ id }: { id: string }) {
  const q = useData(() => getAdminCircular(id), [id]);
  return (
    <>
      <PageHeader title={t("admin.circulars.editTitle")} description={q.data?.titleBn} back={{ href: "/admin/circulars", label: t("admin.circulars.title") }} />
      {q.status === "loading" ? <FormSkeleton fields={8} /> : q.status === "error" ? <ErrorState error={q.error} onRetry={q.reload} /> : <CircularForm circular={q.data} />}
    </>
  );
}
