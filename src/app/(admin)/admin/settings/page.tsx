import type { Metadata } from "next";
import { t } from "@/i18n";
import { AdminSettingsScreen } from "../ai-settings";

export const metadata: Metadata = { title: t("admin.settings.title") };
export const instant = false;

export default function Page() {
  return <AdminSettingsScreen />;
}
