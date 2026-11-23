import type { Metadata } from "next";
import { t } from "@/i18n";
import { ProfileScreen } from "./profile-screen";

export const metadata: Metadata = { title: t("profile.title") };

export const instant = false;

export default function ProfilePage() {
  return <ProfileScreen />;
}
