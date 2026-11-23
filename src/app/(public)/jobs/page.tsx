import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { JobsScreen } from "./jobs-screen";

export const metadata: Metadata = { title: t("jobs.title") };

export default function JobsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JobsScreen />
    </Suspense>
  );
}
