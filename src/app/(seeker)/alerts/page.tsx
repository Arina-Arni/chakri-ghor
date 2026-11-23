import type { Metadata } from "next";
import { t } from "@/i18n";
import { AlertsScreen } from "../lists-screens";

export const metadata: Metadata = { title: t("alerts.title") };
export const instant = false;

export default function Page() {
  return <AlertsScreen />;
}
