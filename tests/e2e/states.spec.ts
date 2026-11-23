import { expect, test } from "@playwright/test";
import { asRole, hasCredentials, settle } from "./routes";

// The ?__state preview is development-only, so these run against `next dev`.
test.describe("UI states via ?__state (spec §2.6)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "one viewport is enough"));

  test("loading shows skeletons", async ({ page }) => {
    await page.goto("/jobs?__state=loading");
    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  });

  test("empty shows an empty state with a next action", async ({ page }) => {
    await page.goto("/jobs?__state=empty");
    await settle(page);
    await expect(page.getByText("এই ফিল্টারে কোনো চাকরি নেই")).toBeVisible();
  });

  test("error shows a Bangla message, retry and a reference id", async ({ page }) => {
    test.skip(!hasCredentials("seeker"), "needs E2E_* credentials for a seeded deployment");
    await asRole(page, "seeker");
    await page.goto("/dashboard?__state=error");
    await settle(page);
    await expect(page.locator("main [role=alert]")).toContainText("কিছু একটা সমস্যা হয়েছে");
    await expect(page.locator("main [role=alert]")).toContainText("REQ-");
    await expect(page.getByRole("button", { name: "আবার চেষ্টা করুন" })).toBeVisible();
  });

  test("AI fallback shows the info notice", async ({ page }) => {
    await page.goto(`/jobs?q=${encodeURIComponent("খুলনায় সরকারি চাকরি")}&ai=1&__state=fallback`);
    await expect(page.getByText("AI এখন ব্যস্ত — সাধারণ খোঁজের ফল দেখানো হচ্ছে")).toBeVisible({ timeout: 15_000 });
  });

  test("quota exceeded shows what's left and a sign-up link for guests", async ({ page }) => {
    await page.goto(`/jobs?q=${encodeURIComponent("ব্যাংক")}&ai=1&__state=quota`);
    await expect(page.getByText("আজকের ফ্রি AI সার্চ শেষ — সাইন আপ করলে আরও পাবেন")).toBeVisible({ timeout: 15_000 });
  });

  test("edit conflict opens the conflict dialog", async ({ page }) => {
    test.skip(!hasCredentials("seeker"), "needs E2E_* credentials for a seeded deployment");
    await asRole(page, "seeker");
    await page.goto("/profile?__state=conflict");
    await settle(page);
    await page.getByRole("button", { name: "সেভ করুন" }).first().click();
    await expect(page.getByRole("dialog")).toContainText("অন্য কেউ এটি পরিবর্তন করেছে");
  });

  test("offline banner appears when the connection drops", async ({ page, context }) => {
    await page.goto("/");
    await settle(page);
    await context.setOffline(true);
    await expect(page.getByText("ইন্টারনেট সংযোগ নেই — সংযোগ ফিরলে আবার চেষ্টা হবে")).toBeVisible();
    await context.setOffline(false);
  });
});
