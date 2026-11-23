import type { Metadata } from "next";
import { t } from "@/i18n";
import { BookmarksScreen } from "../lists-screens";

export const metadata: Metadata = { title: t("bookmarks.title") };
export const instant = false;

export default function Page() {
  return <BookmarksScreen />;
}
