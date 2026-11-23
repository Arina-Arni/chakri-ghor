import type { Metadata } from "next";
import { t } from "@/i18n";
import { SettingsScreen } from "./settings-screen";

export const metadata: Metadata = { title: t("settings.title") };
export const instant = false;

export default function Page() {
  return <SettingsScreen />;
}
