import type { Metadata } from "next";
import { Suspense } from "react";
import { CardsSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { TrackerScreen } from "./tracker-screen";

export const metadata: Metadata = { title: t("tracker.title") };
export const instant = false;

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<CardsSkeleton count={6} />}>
      <TrackerScreen />
    </Suspense>
  );
}
