import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { CircularEdit } from "../../circular-edit";

export const metadata: Metadata = { title: t("admin.circulars.editTitle") };
export const instant = false;

export default function Page({ params }: PageProps<"/admin/circulars/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton fields={6} />}>
      {params.then(({ id }) => (
        <CircularEdit id={id} />
      ))}
    </Suspense>
  );
}
