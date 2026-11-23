import type { Metadata } from "next";
import { t } from "@/i18n";
import { UsersScreen } from "../org-users-audit";

export const metadata: Metadata = { title: t("admin.users.title") };
export const instant = false;

export default function Page() {
  return <UsersScreen />;
}
