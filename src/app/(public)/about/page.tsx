import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";
import { messages, t } from "@/i18n";

export const metadata: Metadata = { title: t("legal.aboutTitle") };

export default function Page() {
  return <ProsePage title={t("legal.aboutTitle")} sections={messages.legal.about} />;
}