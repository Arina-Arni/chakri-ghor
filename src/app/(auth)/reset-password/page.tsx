import type { Metadata } from "next";
import { t } from "@/i18n";
import { ResetPasswordForm } from "../password-forms";

export const metadata: Metadata = { title: t("auth.resetTitle") };

export default function Page() {
  return <ResetPasswordForm />;
}
