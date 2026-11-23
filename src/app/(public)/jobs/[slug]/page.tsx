import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { JobDetailScreen } from "./job-detail-screen";

export const metadata: Metadata = { title: t("common.seeDetails") };

export default function JobDetailPage({ params }: PageProps<"/jobs/[slug]">) {
  return (
    <Suspense fallback={<div className="container-page py-8"><DetailSkeleton /></div>}>
      {params.then(({ slug }) => (
        <JobDetailScreen slug={slug} />
      ))}
    </Suspense>
  );
}
