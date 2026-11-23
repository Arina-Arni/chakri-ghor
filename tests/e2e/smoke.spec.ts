import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { asRole, hasCredentials, ROUTES, settle } from "./routes";

for (const r of ROUTES) {
  test(`${r.name} renders without layout breaks`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    test.skip(!hasCredentials(r.role), "needs E2E_* credentials for a seeded deployment");
    await asRole(page, r.role);
    await page.goto(r.path);
    await settle(page);

    // One visible h1 per page (Cache Components keeps recently visited routes hidden in the DOM).
    await expect(page.locator("h1:visible")).toHaveCount(1);
    // A main landmark to skip to.
    await expect(page.locator("main#main")).toHaveCount(1);
    // No horizontal page scroll.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "horizontal scroll").toBeLessThanOrEqual(1);
    expect(errors, "page errors").toEqual([]);

    // Accessibility: run axe once per route (desktop project) to keep the suite fast.
    if (info.project.name === "desktop") {
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
    }
  });
}
