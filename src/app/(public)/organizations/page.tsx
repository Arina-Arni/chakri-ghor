import type { Metadata } from "next";
import { t } from "@/i18n";
import { OrganizationsList } from "./organizations-list";

export const metadata: Metadata = { title: t("org.listTitle") };

export default function OrganizationsPage() {
  return (
    <div className="container-page py-6 md:py-8">
      <h1 className="text-2xl font-bold md:text-3xl">{t("org.listTitle")}</h1>
      <OrganizationsList />
    </div>
  );
}
