import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailSkeleton } from "@/components/feedback/skeletons";
import { formatDateBn, toBnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import { jobPostingJsonLd, publicCircularForSeo, siteUrl } from "@/server/seo";
import { JobDetailScreen } from "./job-detail-screen";

/** Unique title/description, canonical URL and OpenGraph per circular. */
export async function generateMetadata({ params }: PageProps<"/jobs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await publicCircularForSeo(slug);
  const url = `${siteUrl()}/jobs/${slug}`;
  if (!c) return { title: t("common.seeDetails"), alternates: { canonical: url } };
  const description = `${c.organization.nameBn} · মোট ${toBnDigits(c.totalVacancies)}টি পদ · আবেদনের শেষ সময় ${formatDateBn(c.endAt)}। যোগ্যতা যাচাই করুন ও ATS রিজিউমে বানান।`;
  return {
    title: c.titleBn,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: c.titleBn, description, locale: "bn_BD", siteName: t("brand.name") },
    twitter: { card: "summary_large_image", title: c.titleBn, description },
  };
}

async function JobPostingLd({ slug }: { slug: string }) {
  const c = await publicCircularForSeo(slug);
  if (!c) return null;
  // JSON-LD is data, not script; `<` is escaped so text can't close the tag.
  const json = JSON.stringify(jobPostingJsonLd(c)).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export default function JobDetailPage({ params }: PageProps<"/jobs/[slug]">) {
  return (
    <Suspense fallback={<div className="container-page py-8"><DetailSkeleton /></div>}>
      {params.then(({ slug }) => (
        <>
          <JobPostingLd slug={slug} />
          <JobDetailScreen slug={slug} />
        </>
      ))}
    </Suspense>
  );
}
