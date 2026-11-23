import type { Metadata } from "next";
import { t } from "@/i18n";
import { DashboardScreen } from "./dashboard-screen";

export const metadata: Metadata = { title: t("nav.dashboard") };
export const instant = false;

export default function DashboardPage() {
  return <DashboardScreen />;
}
