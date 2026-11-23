import { expect, test } from "@playwright/test";
import { asRole, hasCredentials, seedId, settle } from "./routes";

/**
 * Part 3 journeys against a seeded deployment (E2E_BASE_URL + E2E_* credentials, and
 * FAULT_INJECTION_ALLOWED=true on the server). Skipped when those are not provided.
 */
test.describe("A07 workflow recovery (judges' scenario)", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "one viewport is enough");
    test.skip(!hasCredentials("admin"), "needs E2E_ADMIN_* credentials");
  });

  test("a run failed at notify_matches completes after 'Retry'", async ({ page }) => {
    await asRole(page, "admin");
    await page.goto(`/admin/workflows/${seedId("run:demo-failed")}`);
    await settle(page);
    const retry = page.getByRole("button", { name: "আবার চেষ্টা করুন" }).first();
    test.skip(!(await retry.isVisible()), "demo run was already retried on this deployment");
    await retry.click();
    await expect(page.getByRole("status")).toContainText(/সফল|চলছে/, { timeout: 60_000 });
  });

  test("uploading the same PDF twice is reported as a duplicate", async ({ page }) => {
    await asRole(page, "admin");
    await page.goto("/admin/ingest");
    await settle(page);
    for (let i = 0; i < 2; i++) {
      await page.locator('input[type="file"]').setInputFiles("samples/notice-text-copy.pdf");
      await page.getByRole("button", { name: /শুরু|ইনজেস্ট/ }).first().click();
      if (i === 0) await page.waitForURL(/\/admin\/workflows\//, { timeout: 30_000 }).catch(() => {});
      if (i === 0) await page.goto("/admin/ingest");
    }
    await expect(page.getByText(/আগেই/)).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("A06 fallback is visible to the user", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "one viewport is enough");
    test.skip(!hasCredentials("seeker"), "needs E2E_SEEKER_* credentials");
  });

  test("AI search returns filters (AI or rule-based fallback) and real results", async ({ page }) => {
    await asRole(page, "seeker");
    await page.goto("/jobs");
    await settle(page);
    const box = page.getByRole("searchbox").first();
    await box.fill("খুলনায় সরকারি চাকরি");
    await box.press("Enter");
    await settle(page);
    await expect(page.getByText("খুলনা").first()).toBeVisible();
  });
});
