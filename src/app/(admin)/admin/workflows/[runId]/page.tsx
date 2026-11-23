import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { RunScreen } from "../run-screen";

export const metadata: Metadata = { title: t("admin.ingest.title") };
export const instant = false;

export default function Page({ params }: PageProps<"/admin/workflows/[runId]">) {
  return (
    <Suspense fallback={<FormSkeleton fields={6} />}>
      {params.then(({ runId }) => (
        <RunScreen runId={runId} />
      ))}
    </Suspense>
  );
}
