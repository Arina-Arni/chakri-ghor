import type { Metadata } from "next";
import { t } from "@/i18n";
import { NotificationsScreen } from "../lists-screens";

export const metadata: Metadata = { title: t("notifications.title") };
export const instant = false;

export default function Page() {
  return <NotificationsScreen />;
}
