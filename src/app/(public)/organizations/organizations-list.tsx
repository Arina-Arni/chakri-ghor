"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Building2 } from "lucide-react";
import { OrgAvatar } from "@/components/jobs/org-avatar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { CardsSkeleton } from "@/components/feedback/skeletons";
import { Input } from "@/components/ui/input";
import { listOrganizations } from "@/data";
import { useData } from "@/hooks/use-data";
import { t } from "@/i18n";

export function OrganizationsList() {
  const q = useData(() => listOrganizations(), []);
  const [search, setSearch] = useState("");
  if (q.status === "loading") return <div className="mt-6"><CardsSkeleton count={6} /></div>;
  if (q.status === "error") return <ErrorState className="mt-6" error={q.error} onRetry={q.reload} />;
  const s = search.trim().toLowerCase();
  const list = q.data.filter((o) => !s || `${o.nameBn} ${o.nameEn} ${o.shortName}`.toLowerCase().includes(s));
  return (
    <>
      <div className="mt-4 max-w-md">
        <label htmlFor="org-q" className="sr-only">{t("common.search")}</label>
        <Input id="org-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.searchPlaceholder")} />
      </div>
      {list.length === 0 ? (
        <EmptyState className="mt-6" icon={Building2} title={t("common.noMatch")} />
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((o) => (
            <li key={o.id}>
              <Link href={`/organizations/${o.slug}`} className="flex h-full items-center gap-3 rounded-xl border bg-surface p-4 shadow-card hover:border-primary">
                <OrgAvatar shortName={o.shortName} seed={o.slug} />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">
                    {o.nameBn}
                    {o.verified && <BadgeCheck className="ml-1 inline size-4 text-primary" aria-label={t("jobCard.verified")} />}
                  </span>
                  <span className="text-sm text-muted-foreground">{t("org.counts", { open: o.openCircularCount, total: o.totalCircularCount })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
