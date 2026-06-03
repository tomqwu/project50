/**
 * UI e2e for the Project 50 program (M0 #37).
 *
 * Sign-in method: programmatic CSRF + /api/auth/callback/e2e POST with a unique
 * handle (same pattern as ui-journey.spec.ts) so each run is isolated and never
 * shares the fixed "demo" account.
 *
 * Covers the interactive program flow that only exists in the UI:
 *   start choice → start a run → Day 1 / 50 checklist → check all 7 rules → 7/7
 *   completes the day → state persists across a reload.
 *
 * The hard-reset / FAILED path (a past day < 7/7 flips the run to FAILED on the
 * next load) is intentionally NOT exercised here: it depends on real calendar
 * time advancing past the start day, which can't be driven through the real-time
 * UI. That logic is covered deterministically (with an injected `now`) by the
 * integration suite, apps/web/lib/project50.integration.test.ts → "hard reset".
 */

import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

/** Sign a brand-new, uniquely-handled user in via the e2e credentials callback. */
async function signInFreshUser(requestContext: import("@playwright/test").APIRequestContext) {
  const handle = `e2e-p50-${randomUUID()}`;
  const csrfRes = await requestContext.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await requestContext.post("/api/auth/callback/e2e", {
    form: { csrfToken, handle, callbackUrl: "http://localhost:3000/", json: "true" },
  });
  expect(res.ok()).toBeTruthy();
  return handle;
}

test("Project 50: start → check all 7 rules → 7/7 completes the day, and persists", async ({
  page,
}) => {
  // ─── Step 1: Sign in as a brand-new user (no challenges, no Project 50 run) ──
  await signInFreshUser(page.request);

  // ─── Step 2: Home shows the Project 50 start choice ─────────────────────────
  await page.goto("/");
  await page.waitForURL("/", { timeout: 15_000 });
  expect(page.url()).not.toContain("/signin");

  const startButton = page.getByRole("button", { name: /start project 50/i });
  await expect(startButton).toBeVisible({ timeout: 10_000 });
  // The custom-plan escape hatch is offered alongside.
  await expect(page.getByRole("link", { name: /custom plan/i })).toHaveAttribute(
    "href",
    "/challenges/new",
  );

  // ─── Step 3: Start a run → Day 1 / 50 checklist with 0/7 ────────────────────
  await startButton.click();

  await expect(page.getByRole("heading", { name: /Day 1 \/ 50/i })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/0 \/ 7 today/i)).toBeVisible();
  // All 7 rule rows render.
  await expect(page.getByTestId(/^rule-row-/)).toHaveCount(7);

  // ─── Step 4: Check each rule; the counter climbs 1/7 … 7/7 ──────────────────
  // Each click fires a server action + revalidatePath("/") round-trip. Fire them
  // strictly serially — wait for the clicked row to render its ✓ AND for the
  // network to settle before the next click — so a back-to-back burst can't drop
  // or coalesce a re-render (which intermittently stalled the counter under CI's
  // parallel-worker load).
  for (let ruleId = 1; ruleId <= 7; ruleId++) {
    await page.getByTestId(`rule-row-${ruleId}`).click();
    // The clicked row now shows its checkmark…
    await expect(page.getByTestId(`rule-row-${ruleId}`)).toContainText("✓", {
      timeout: 20_000,
    });
    // …and the revalidation round-trip has settled before the next click.
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(new RegExp(`${ruleId} / 7 today`, "i"))).toBeVisible({
      timeout: 20_000,
    });
  }

  // ─── Step 5: Reload → the completed 7/7 Day 1 state persists ─────────────────
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Day 1 \/ 50/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/7 \/ 7 today/i)).toBeVisible({ timeout: 20_000 });
});
