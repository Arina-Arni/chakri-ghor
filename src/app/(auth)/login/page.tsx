import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t("auth.loginTitle") };

export default function LoginPage() {
  return (
    <Suspense fallback={<FormSkeleton fields={2} />}>
      <LoginForm />
    </Suspense>
  );
}
