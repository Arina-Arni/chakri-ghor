import type { Metadata } from "next";
import { t } from "@/i18n";
import { AuditScreen } from "../org-users-audit";

export const metadata: Metadata = { title: t("admin.audit.title") };
export const instant = false;

export default function Page() {
  return <AuditScreen />;
}
