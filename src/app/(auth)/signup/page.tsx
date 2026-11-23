import type { Metadata } from "next";
import { t } from "@/i18n";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: t("auth.signupTitle") };

export default function SignupPage() {
  return <SignupForm />;
}
