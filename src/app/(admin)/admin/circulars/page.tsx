import type { Metadata } from "next";
import { t } from "@/i18n";
import { CircularsScreen } from "./circulars-screen";

export const metadata: Metadata = { title: t("admin.circulars.title") };
export const instant = false;

export default function Page() {
  return <CircularsScreen />;
}
