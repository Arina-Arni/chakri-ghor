import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { ReviewDetailScreen } from "../review-screens";

export const metadata: Metadata = { title: t("admin.review.title") };
export const instant = false;

export default function Page({ params }: PageProps<"/admin/review/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton fields={6} />}>
      {params.then(({ id }) => (
        <ReviewDetailScreen id={id} />
      ))}
    </Suspense>
  );
}
