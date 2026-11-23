import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/feedback/skeletons";
import { t } from "@/i18n";
import { OrganizationScreen } from "./organization-screen";

export const metadata: Metadata = { title: t("org.listTitle") };

export default function OrganizationPage({ params }: PageProps<"/organizations/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ slug }) => (
        <OrganizationScreen slug={slug} />
      ))}
    </Suspense>
  );
}
