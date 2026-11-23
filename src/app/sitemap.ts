import type { MetadataRoute } from "next";
import { siteUrl, sitemapEntries } from "@/server/seo";

/** Public pages, every published circular and every organization. Revalidated on publish. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const { circulars, organizations } = await sitemapEntries();
  const staticPages = ["", "/jobs", "/organizations", "/pricing", "/about", "/privacy", "/terms"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.6,
  }));
  return [
    ...staticPages,
    ...circulars.map((c) => ({ url: `${base}/jobs/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...organizations.map((o) => ({ url: `${base}/organizations/${o.slug}`, lastModified: o.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
