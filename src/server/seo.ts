import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { districtById, divisionById } from "@/domain/taxonomy";
import type { Circular } from "@/types";
import { hasSupabase } from "@/env";
import { getDb } from "@/server/db/client";
import { isPublicCircular, loadCirculars } from "@/server/db/queries/circulars";
import { circulars, organizations } from "@/server/db/schema";

export function siteUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL) && hasSupabase();
}

/** A published circular for metadata and JSON-LD (cached, revalidated on publish). */
export async function publicCircularForSeo(slug: string): Promise<Circular | null> {
  "use cache";
  cacheTag(`circular:${slug}`);
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  if (!dbConfigured()) return null;
  try {
    const [c] = await loadCirculars(getDb(), and(eq(circulars.slug, slug), isPublicCircular), Date.now());
    return c ?? null;
  } catch {
    return null;
  }
}

/** Entries for sitemap.xml (published circulars and organizations). */
export async function sitemapEntries(): Promise<{ circulars: { slug: string; updatedAt: Date }[]; organizations: { slug: string; updatedAt: Date }[] }> {
  "use cache";
  cacheTag("sitemap");
  cacheLife({ stale: 600, revalidate: 600, expire: 86_400 });
  if (!dbConfigured()) return { circulars: [], organizations: [] };
  try {
    const db = getDb();
    const [cs, os] = await Promise.all([
      db.select({ slug: circulars.slug, updatedAt: circulars.updatedAt }).from(circulars).where(isPublicCircular).orderBy(desc(circulars.updatedAt)).limit(5000),
      db.select({ slug: organizations.slug, updatedAt: organizations.updatedAt }).from(organizations).where(sql`${organizations.deletedAt} is null`).limit(2000),
    ]);
    return { circulars: cs, organizations: os };
  } catch {
    return { circulars: [], organizations: [] };
  }
}

const EMPLOYMENT: Record<Circular["jobType"], string> = { full_time: "FULL_TIME", part_time: "PART_TIME", contract: "CONTRACTOR", internship: "INTERN" };

/** schema.org JobPosting (Google for Jobs). */
export function jobPostingJsonLd(c: Circular): Record<string, unknown> {
  const salaries = c.posts.flatMap((p) => [p.salaryMin, p.salaryMax]).filter((v): v is number => v != null);
  const district = c.districtId ? districtById.get(c.districtId) : null;
  const division = c.divisionId ? divisionById.get(c.divisionId) : null;
  const description = [c.descriptionBn, ...c.posts.map((p) => `${p.titleBn} — ${p.vacancies} টি পদ`), ...c.howToApplyBn].filter(Boolean).join("\n");
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: c.posts.length === 1 ? c.posts[0].titleBn : c.titleBn,
    description: description || c.titleBn,
    identifier: { "@type": "PropertyValue", name: c.organization.nameBn, value: c.noticeNo || c.id },
    datePosted: c.publishedAt ?? c.createdAt,
    validThrough: c.endAt,
    employmentType: EMPLOYMENT[c.jobType],
    hiringOrganization: { "@type": "Organization", name: c.organization.nameBn, alternateName: c.organization.nameEn },
    ...(c.workMode === "remote"
      ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "Bangladesh" } }
      : {
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: district?.nameEn ?? division?.nameEn ?? "Dhaka", addressRegion: division?.nameEn, addressCountry: "BD" },
          },
        }),
    ...(salaries.length
      ? { baseSalary: { "@type": "MonetaryAmount", currency: "BDT", value: { "@type": "QuantitativeValue", minValue: Math.min(...salaries), maxValue: Math.max(...salaries), unitText: "MONTH" } } }
      : {}),
    totalJobOpenings: c.totalVacancies,
    directApply: false,
    url: `${siteUrl()}/jobs/${c.slug}`,
  };
}
