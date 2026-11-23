import type { MetadataRoute } from "next";
import { siteUrl } from "@/server/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/jobs", "/organizations", "/pricing"],
        disallow: ["/admin", "/api/", "/auth/", "/dashboard", "/profile", "/resumes", "/applications", "/bookmarks", "/alerts", "/notifications", "/settings", "/billing", "/onboarding"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
