import type { Metadata } from "next";
import { t } from "@/i18n";
import { ReviewQueueScreen } from "./review-screens";

export const metadata: Metadata = { title: t("admin.review.title") };
export const instant = false;

export default function Page() {
  return <ReviewQueueScreen />;
}
