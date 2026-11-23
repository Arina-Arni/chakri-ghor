import { test } from "@playwright/test";
import { asRole, hasCredentials, ROUTES, settle } from "./routes";

/**
 * Captures every screen at mobile (360) and desktop (1280) width for docs/UI.md.
 * Run with: npm run screenshots (best against a production server: E2E_BASE_URL=…).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture docs screenshots");

for (const r of ROUTES) {
  test(`screenshot ${r.name}`, async ({ browser }) => {
    for (const [label, width] of [["mobile", 360], ["desktop", 1280]] as const) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 360 ? 780 : 900 }, locale: "bn-BD", timezoneId: "Asia/Dhaka" });
      const page = await ctx.newPage();
      test.skip(!hasCredentials(r.role), "needs E2E_* credentials for a seeded deployment");
      await asRole(page, r.role);
      await page.goto(r.path);
      await settle(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `docs/screenshots/${r.name}-${label}.jpg`, type: "jpeg", quality: 60, fullPage: false });
      await ctx.close();
    }
  });
}
