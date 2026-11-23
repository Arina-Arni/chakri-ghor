import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { t } from "@/i18n";
import { ResumeList } from "./resume-list";

export const metadata: Metadata = { title: t("resume.listTitle") };
export const instant = false;

export default function ResumesPage() {
  return (
    <>
      <PageHeader title={t("resume.listTitle")} />
      <ResumeList />
    </>
  );
}
