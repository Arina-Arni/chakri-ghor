import type { Metadata } from "next";
import { t } from "@/i18n";
import { IngestScreen } from "./ingest-screen";

export const metadata: Metadata = { title: t("admin.ingest.title") };
export const instant = false;

export default function Page() {
  return <IngestScreen />;
}
