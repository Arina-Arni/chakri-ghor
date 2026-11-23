import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { ResumeEditor } from "./resume-editor";

export const metadata: Metadata = { title: t("resume.listTitle") };
export const instant = false;

export default function ResumePage({ params }: PageProps<"/resumes/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      {params.then(({ id }) => (
        <ResumeEditor id={id} />
      ))}
    </Suspense>
  );
}
