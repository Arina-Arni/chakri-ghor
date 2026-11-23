import type { Metadata } from "next";
import { t } from "@/i18n";
import { AiHealthScreen } from "../ai-settings";

export const metadata: Metadata = { title: t("admin.aiHealth.title") };
export const instant = false;

export default function Page() {
  return <AiHealthScreen />;
}
