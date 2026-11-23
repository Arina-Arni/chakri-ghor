import type { Metadata } from "next";
import { t } from "@/i18n";
import { ForgotPasswordForm } from "../password-forms";

export const metadata: Metadata = { title: t("auth.forgotTitle") };

export default function Page() {
  return <ForgotPasswordForm />;
}
