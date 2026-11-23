import type { Metadata } from "next";
import { t } from "@/i18n";
import { OnboardingScreen } from "./onboarding-screen";

export const metadata: Metadata = { title: t("onboarding.title") };

export const instant = false;

export default function OnboardingPage() {
  return <OnboardingScreen />;
}
