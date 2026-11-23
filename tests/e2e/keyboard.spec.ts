import { expect, test, type Page } from "@playwright/test";
import { asRole, hasCredentials, settle } from "./routes";

/** Press Tab until the focused element matches, like a keyboard-only user would. */
async function tabTo(page: Page, matches: (el: { tag: string; text: string; label: string | null }) => boolean, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const el = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return { tag: a?.tagName ?? "", text: (a?.textContent ?? "").trim(), label: a?.getAttribute("aria-label") ?? null };
    });
    if (matches(el)) return;
  }
  throw new Error("element not reachable with Tab");
}

test.describe("keyboard-only walkthrough (spec §11)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "desktop flow"));

  test("search → job detail → wizard → tracker → resume editor", async ({ page }) => {
    test.skip(!hasCredentials("seeker"), "needs E2E_* credentials for a seeded deployment");
    await asRole(page, "seeker");

    // 1. Skip link, then search with the keyboard.
    await page.goto("/jobs");
    await settle(page);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "মূল কনটেন্টে যান" })).toBeFocused();
    await tabTo(page, (e) => e.label === null && e.tag === "INPUT" && e.text === "");
    await page.keyboard.type("অফিস সহকারী");
    await page.keyboard.press("Enter");
    await settle(page);

    // 2. Open a job detail through its title link.
    await tabTo(page, (e) => e.tag === "A" && e.text.includes("জেলা প্রশাসকের কার্যালয়, খুলনা —"));
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/jobs\/dc-khulna/);
    await settle(page);
    await expect(page.locator("h1:visible")).toContainText("খুলনা");

    // 3. Onboarding wizard: move to step 2 with the keyboard.
    await page.goto("/onboarding");
    await settle(page);
    await tabTo(page, (e) => e.tag === "BUTTON" && e.text.includes("পরবর্তী"), 120);
    await page.keyboard.press("Enter");
    await expect(page.locator("#step-title")).toContainText("সিভি ও অভিজ্ঞতা", { timeout: 10_000 });

    // 4. Tracker: change a status through the keyboard-accessible select.
    await page.goto("/applications");
    await settle(page);
    await tabTo(page, (e) => e.tag === "BUTTON" && (e.label ?? "").includes("অবস্থা বদলান"), 120);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");

    // 5. Resume editor: edit inline with Enter, save with Enter.
    await page.goto("/resumes/res_dev");
    await settle(page);
    await tabTo(page, (e) => e.tag === "BUTTON" && (e.label ?? "").startsWith("Headline সম্পাদনা করুন"), 120);
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "Headline সম্পাদনা করুন" });
    await expect(input).toBeFocused();
    await input.fill("Junior Frontend Developer");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /Headline সম্পাদনা করুন: Junior Frontend Developer/ })).toBeVisible();
  });
});
