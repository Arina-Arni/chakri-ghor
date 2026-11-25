"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlarmClock,
  Briefcase,
  FileStack,
  GraduationCap,
  HandHeart,
  HardHat,
  Landmark,
  Laptop,
  Megaphone,
  Palette,
  Shapes,
  Shield,
  Sprout,
  Stethoscope,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { JobCard } from "@/components/jobs/job-card";
import { SearchBar, type SearchMode } from "@/components/jobs/search-bar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { JobCardSkeleton, LoadingRegion, StatTilesSkeleton } from "@/components/feedback/skeletons";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { getLandingStats } from "@/data";
import { formatNumberBn } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { t } from "@/i18n";

export function HeroSearch() {
  const router = useRouter();
  const [mode, setMode] = useState<SearchMode>("ai");
  return (
    <SearchBar
      tone="hero"
      mode={mode}
      onModeChange={setMode}
      showExamples
      className="max-w-3xl"
      onSubmit={(text, m) => {
        const params = new URLSearchParams();
        if (text) params.set("q", text);
        if (m === "ai" && text) params.set("ai", "1");
        router.push(`/jobs${params.size ? `?${params}` : ""}`);
      }}
    />
  );
}

/** Solid card colour (white / night navy) with a lifted shadow, for tiles that overlap the hero. */
const SOLID_TILE = "bg-card shadow-raised";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  landmark: Landmark,
  "graduation-cap": GraduationCap,
  stethoscope: Stethoscope,
  "hard-hat": HardHat,
  laptop: Laptop,
  palette: Palette,
  shield: Shield,
  "hand-heart": HandHeart,
  wrench: Wrench,
  sprout: Sprout,
  megaphone: Megaphone,
  shapes: Shapes,
};

function iconFor(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? Briefcase;
}

export function LandingLive() {
  const q = useData(() => getLandingStats(), []);

  if (q.status === "error") {
    return (
      <div className="container-page py-10">
        <ErrorState error={q.error} onRetry={q.reload} />
      </div>
    );
  }

  const d = q.data;
  return (
    <>
      {/* These tiles overlap the hero's bottom edge, so they are solid: a see-through glass tile
          would show the dark hero through its top half and look cut in two. */}
      <section className="container-page -mt-8 md:-mt-10" aria-label="সংক্ষিপ্ত পরিসংখ্যান">
        {!d ? (
          <StatTilesSkeleton count={3} className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3" tileClassName={SOLID_TILE} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile className={SOLID_TILE} value={d.openCirculars} label={t("landing.statOpen")} icon={FileStack} />
            <StatTile className={SOLID_TILE} value={d.totalVacancies} label={t("landing.statVacancies")} icon={Users} />
            <StatTile className={SOLID_TILE} value={d.closingToday} label={t("landing.statClosingToday")} icon={AlarmClock} tone={d.closingToday ? "danger" : "default"} />
          </div>
        )}
      </section>

      <section className="container-page pt-12" aria-labelledby="closing-title">
        <div className="flex items-end justify-between gap-3">
          <h2 id="closing-title" className="text-2xl font-bold">
            {t("landing.closingTodayTitle")}
          </h2>
          <Link href="/jobs?deadlineWithin=today" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
            {t("common.seeAll")}
          </Link>
        </div>
        {!d ? (
          <LoadingRegion className="mt-4 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <JobCardSkeleton key={i} compact />
            ))}
          </LoadingRegion>
        ) : d.closingTodayJobs.length === 0 ? (
          <EmptyState className="mt-4" icon={AlarmClock} title={t("landing.closingTodayEmpty")} headingLevel={3} />
        ) : (
          <ul
            tabIndex={0}
            aria-label={t("landing.closingTodayTitle")}
            className="scrollbar-thin mt-4 flex snap-x gap-4 overflow-x-auto pb-3"
          >
            {d.closingTodayJobs.map((job) => (
              <li key={job.id} className="w-[85%] max-w-sm shrink-0 snap-start sm:w-80">
                <JobCard job={job} variant="compact" className="h-full" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="categories" className="container-page scroll-mt-20 pt-12" aria-labelledby="cat-title">
        <h2 id="cat-title" className="text-2xl font-bold">
          {t("landing.categoriesTitle")}
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {(d?.categories ?? Array.from({ length: 10 }, () => null)).map((c, i) =>
            c ? (
              <li key={c.id}>
                <Link href={`/jobs?category=${c.id}`} className="flex h-full min-h-24 flex-col gap-2 rounded-xl border bg-surface p-4 shadow-card transition-colors hover:border-primary">
                  {(() => {
                    const I = iconFor(c.icon);
                    return <I className="size-6 text-primary" aria-hidden />;
                  })()}
                  <span className="font-semibold">{c.nameBn}</span>
                  <span className="text-sm text-muted-foreground">{t("landing.jobsCount", { n: c.count })}</span>
                </Link>
              </li>
            ) : (
              <li key={i}>
                <Skeleton className="h-24 rounded-xl" />
              </li>
            ),
          )}
        </ul>
        <h2 className="mt-10 text-2xl font-bold">{t("landing.divisionsTitle")}</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(d?.divisions ?? Array.from({ length: 8 }, () => null)).map((v, i) =>
            v ? (
              <li key={v.id}>
                <Link href={`/jobs?division=${v.id}`} className="flex min-h-14 items-center justify-between gap-2 rounded-xl border bg-surface px-4 py-3 hover:border-primary">
                  <span className="font-medium">{v.nameBn}</span>
                  <span className="rounded-full bg-muted px-2 text-sm text-muted-foreground tabular-nums">{formatNumberBn(v.count)}</span>
                </Link>
              </li>
            ) : (
              <li key={i}>
                <Skeleton className="h-14 rounded-xl" />
              </li>
            ),
          )}
        </ul>
      </section>
    </>
  );
}
