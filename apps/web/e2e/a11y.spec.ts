/**
 * Automated accessibility regression guard (WCAG 2.1 AA) — issue #137.
 *
 * Signs in a fresh, uniquely-handled user via the e2e Credentials callback (same
 * pattern as project50.spec.ts / ui-journey.spec.ts), then runs axe-core against
 * the key authenticated screens (dashboard, feed, settings) and asserts there are
 * NO serious or critical violations. This pins the app shell's a11y wins (skip
 * link, landmarks, accessible names) and catches regressions in CI's prod-build
 * e2e job.
 *
 * Scope of the assertion is intentionally serious/critical only: those map to the
 * concrete WCAG 2.1 A/AA failures we fix here, and keep the guard stable against
 * lower-severity "best-practice" advisories that aren't conformance failures.
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

/** Sign a brand-new, uniquely-handled user in via the e2e credentials callback. */
async function signInFreshUser(requestContext: import("@playwright/test").APIRequestContext) {
  const handle = `e2e-a11y-${randomUUID()}`;
  const csrfRes = await requestContext.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await requestContext.post("/api/auth/callback/e2e", {
    form: { csrfToken, handle, callbackUrl: "http://localhost:3000/", json: "true" },
  });
  expect(res.ok()).toBeTruthy();
  return handle;
}

/** WCAG 2.1 A + AA conformance tags axe should evaluate against. */
const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const KEY_PAGES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "dashboard", path: "/" },
  { name: "feed", path: "/feed" },
  { name: "settings", path: "/settings" },
];

test.describe("Accessibility (WCAG 2.1 AA) — key authenticated screens", () => {
  for (const { name, path } of KEY_PAGES) {
    test(`${name} has no serious or critical axe violations`, async ({ page }) => {
      await signInFreshUser(page.request);

      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Ensure we landed on the intended page and weren't bounced to sign-in.
      expect(page.url()).not.toContain("/signin");

      const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );

      // Surface a readable summary if anything fails.
      const summary = blocking
        .map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)]`)
        .join("\n");
      expect(blocking, `Serious/critical a11y violations on ${name}:\n${summary}`).toEqual([]);
    });
  }

  test("dashboard exposes skip-link + landmarks for assistive tech", async ({ page }) => {
    await signInFreshUser(page.request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Skip-to-content link points at the main landmark.
    const skip = page.getByRole("link", { name: /skip to content/i });
    await expect(skip).toHaveAttribute("href", "#main");

    // Labelled primary nav + a single main landmark with the skip target id.
    await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible();
    const main = page.locator("main#main");
    await expect(main).toHaveCount(1);
  });
});
