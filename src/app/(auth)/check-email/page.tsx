import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { CheckEmail } from "../password-forms";

export const metadata: Metadata = { title: t("auth.checkEmailTitle") };

export default function Page() {
  return (
    <Suspense fallback={<FormSkeleton fields={1} />}>
      <CheckEmail />
    </Suspense>
  );
}
