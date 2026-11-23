"use client";

import Link from "next/link";
import { BadgeCheck, Building2, ExternalLink, FileSearch, History } from "lucide-react";
import { JobCard } from "@/components/jobs/job-card";
import { OrgAvatar } from "@/components/jobs/org-avatar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { JobListSkeleton } from "@/components/feedback/skeletons";
import { Breadcrumbs } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOrganization } from "@/data";
import { useData } from "@/hooks/use-data";
import { t } from "@/i18n";

export function OrganizationScreen({ slug }: { slug: string }) {
  const q = useData(() => getOrganization(slug), [slug]);
  if (q.status === "loading") return <div className="container-page py-8"><JobListSkeleton count={3} /></div>;
  if (q.status === "error")
    return (
      <div className="container-page py-10">
        {q.error.code === "NOT_FOUND" ? (
          <EmptyState icon={FileSearch} title={t("states.notFoundTitle")} action={<Button asChild><Link href="/organizations">{t("org.listTitle")}</Link></Button>} />
        ) : (
          <ErrorState error={q.error} onRetry={q.reload} />
        )}
      </div>
    );
  const { organization: o, open, past } = q.data;
  return (
    <div className="container-page py-6 md:py-8">
      <title>{`${o.nameBn} · ${t("brand.name")}`}</title>
      <Breadcrumbs className="mb-4" items={[{ href: "/", label: t("common.home") }, { href: "/organizations", label: t("org.listTitle") }, { label: o.nameBn }]} />
      <header className="flex flex-col gap-4 rounded-xl border bg-surface p-5 shadow-card sm:flex-row sm:items-center">
        <OrgAvatar shortName={o.shortName} seed={o.slug} size="lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-bold">{o.nameBn}</h1>
          <p className="text-muted-foreground" lang="en">{o.nameEn}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t(`enums.orgType.${o.type}`)}</Badge>
            {o.verified ? (
              <Badge variant="primary"><BadgeCheck aria-hidden />{t("jobCard.verified")}</Badge>
            ) : (
              <Badge variant="neutral">{t("jobCard.unverified")}</Badge>
            )}
            <span className="text-sm text-muted-foreground">{t("org.counts", { open: open.length, total: open.length + past.length })}</span>
          </div>
        </div>
        {o.website && (
          <Button asChild variant="secondary">
            <a href={o.website} target="_blank" rel="noopener noreferrer">
              {t("org.website")}
              <ExternalLink aria-hidden />
              <span className="sr-only">{t("detail.opensNewTab")}</span>
            </a>
          </Button>
        )}
      </header>

      <section className="mt-8" aria-labelledby="open-h">
        <h2 id="open-h" className="mb-3 text-xl font-semibold">{t("org.openCirculars")}</h2>
        {open.length === 0 ? (
          <EmptyState icon={Building2} title={t("org.noOpen")} headingLevel={3} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">{open.map((j) => <li key={j.id}><JobCard job={j} /></li>)}</ul>
        )}
      </section>
      <section className="mt-8" aria-labelledby="past-h">
        <h2 id="past-h" className="mb-3 text-xl font-semibold">{t("org.pastCirculars")}</h2>
        {past.length === 0 ? (
          <EmptyState icon={History} title={t("org.noPast")} headingLevel={3} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">{past.map((j) => <li key={j.id}><JobCard job={j} variant="compact" /></li>)}</ul>
        )}
      </section>
    </div>
  );
}
