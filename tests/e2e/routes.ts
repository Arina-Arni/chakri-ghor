import type { Page } from "@playwright/test";

export type Role = "guest" | "seeker" | "moderator" | "admin";

/** Every route in spec §3.2, with a sample for dynamic segments and the role that can see it. */
export const ROUTES: { path: string; role: Role; name: string }[] = [
  { path: "/", role: "guest", name: "landing" },
  { path: "/jobs", role: "guest", name: "jobs" },
  { path: "/jobs/dc-khulna-office-assistant-2026", role: "guest", name: "job-detail" },
  { path: "/organizations", role: "guest", name: "organizations" },
  { path: "/organizations/dc-office-khulna", role: "guest", name: "organization" },
  { path: "/pricing", role: "guest", name: "pricing" },
  { path: "/about", role: "guest", name: "about" },
  { path: "/privacy", role: "guest", name: "privacy" },
  { path: "/terms", role: "guest", name: "terms" },
  { path: "/login", role: "guest", name: "login" },
  { path: "/signup", role: "guest", name: "signup" },
  { path: "/forgot-password", role: "guest", name: "forgot-password" },
  { path: "/reset-password", role: "guest", name: "reset-password" },
  { path: "/check-email?email=rahima%40example.com", role: "guest", name: "check-email" },
  { path: "/onboarding", role: "seeker", name: "onboarding" },
  { path: "/dashboard", role: "seeker", name: "dashboard" },
  { path: "/profile", role: "seeker", name: "profile" },
  { path: "/resumes", role: "seeker", name: "resumes" },
  { path: "/resumes/res_dev", role: "seeker", name: "resume-editor" },
  { path: "/applications", role: "seeker", name: "applications" },
  { path: "/bookmarks", role: "seeker", name: "bookmarks" },
  { path: "/alerts", role: "seeker", name: "alerts" },
  { path: "/notifications", role: "seeker", name: "notifications" },
  { path: "/settings", role: "seeker", name: "settings" },
  { path: "/billing", role: "seeker", name: "billing" },
  { path: "/billing/checkout/mock", role: "seeker", name: "checkout-mock" },
  { path: "/admin", role: "admin", name: "admin" },
  { path: "/admin/circulars", role: "admin", name: "admin-circulars" },
  { path: "/admin/circulars/new", role: "admin", name: "admin-circular-new" },
  { path: "/admin/circulars/cir_001/edit", role: "admin", name: "admin-circular-edit" },
  { path: "/admin/review", role: "admin", name: "admin-review" },
  { path: "/admin/review/rq_1", role: "admin", name: "admin-review-item" },
  { path: "/admin/ingest", role: "admin", name: "admin-ingest" },
  { path: "/admin/workflows/run_1043", role: "admin", name: "admin-workflow" },
  { path: "/admin/organizations", role: "admin", name: "admin-organizations" },
  { path: "/admin/users", role: "admin", name: "admin-users" },
  { path: "/admin/audit", role: "admin", name: "admin-audit" },
  { path: "/admin/ai-health", role: "admin", name: "admin-ai-health" },
  { path: "/admin/settings", role: "admin", name: "admin-settings" },
  { path: "/this-page-does-not-exist", role: "guest", name: "not-found" },
];

/** Use the mock session (data/session.ts) for the given role. */
export async function asRole(page: Page, role: Role) {
  await page.addInitScript((r) => {
    try {
      window.localStorage.setItem("cr:mockRole", r);
    } catch {
      // ignore
    }
  }, role);
}

/** Wait until skeletons and busy regions are gone (data arrived). */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(300);
}
