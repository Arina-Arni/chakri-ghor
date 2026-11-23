import type { Metadata } from "next";
import { t } from "@/i18n";
import { OverviewScreen } from "./overview-screen";

export const metadata: Metadata = { title: t("admin.overview.title") };
export const instant = false;

export default function Page() {
  return <OverviewScreen />;
}
