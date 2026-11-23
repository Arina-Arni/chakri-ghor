import type { Metadata } from "next";
import { t } from "@/i18n";
import { OrganizationsAdminScreen } from "../org-users-audit";

export const metadata: Metadata = { title: t("admin.orgs.title") };
export const instant = false;

export default function Page() {
  return <OrganizationsAdminScreen />;
}
