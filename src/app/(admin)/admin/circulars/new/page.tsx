import type { Metadata } from "next";
import { t } from "@/i18n";
import { CircularNew } from "../circular-edit";

export const metadata: Metadata = { title: t("admin.circulars.newTitle") };
export const instant = false;

export default function Page() {
  return <CircularNew />;
}
