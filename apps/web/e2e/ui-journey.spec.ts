/**
 * UI e2e journey: browser-driven flow through the real Next.js app.
 *
 * Sign-in method: programmatic CSRF + /api/auth/callback/e2e POST with a
 * unique handle (same pattern as journey.spec.ts / share.spec.ts).  This keeps
 * the test isolated and avoids sharing the fixed "demo" account that the dev
 * button now always signs in as.
 *
 * Challenge creation: there is no create-challenge UI screen yet (Phase 4 gap),
 * so we seed the challenge via the authenticated API using the browser context's
 * session cookie (page.request shares cookies with page).
 */

import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("UI journey: sign-in → seed challenge → log activity → verify completion → feed", async ({
  page,
}) => {
  // ─── Step 1: Sign in programmatically (unique handle per run) ────────────
  const handle = `e2e-ui-${randomUUID()}`;
  const csrfRes = await page.request.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post("/api/auth/callback/e2e", {
    form: {
      csrfToken,
      handle,
      callbackUrl: "http://localhost:3000/",
      json: "true",
    },
  });

  // ─── Step 2: Navigate to dashboard (authenticated) ────────────────────────
  await page.goto("/");
  await page.waitForURL("/", { timeout: 15_000 });
  expect(page.url()).toMatch(/\/$/);

  // ─── Step 3: Confirm authenticated dashboard renders ─────────────────────
  // The app-shell nav always renders "project50" when authenticated.
  // With no challenges yet for this brand-new user, the empty-state renders.
  // Either way, the shell nav should be present.
  const nav = page.locator("nav");
  await expect(nav).toBeVisible();
  // Confirm we are NOT on /signin any more.
  expect(page.url()).not.toContain("/signin");

  // ─── Step 4: Seed a TARGET challenge via the API ──────────────────────────
  // page.request shares the browser context's cookies, so the session cookie
  // from Step 2 is automatically included.
  const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  const createRes = await page.request.post("/api/challenges", {
    data: {
      title: "E2E UI",
      goalType: "TARGET",
      unit: "min",
      dailyTarget: 60,
      startDate: todayKey,
      timezone: "UTC",
      visibility: "PUBLIC",
    },
  });
  expect(createRes.status()).toBe(201);
  const challenge = (await createRes.json()) as { id: string };
  expect(typeof challenge.id).toBe("string");
  const challengeId = challenge.id;

  // ─── Step 5: Reload dashboard → challenge appears ────────────────────────
  await page.goto("/");
  // The primary challenge title is rendered in an <h1>.
  await expect(page.getByRole("heading", { name: /E2E UI/i })).toBeVisible({
    timeout: 10_000,
  });
  // The day counter renders "Day 1 / 50" via the data-testid="day-number" span.
  await expect(page.getByTestId("day-number")).toContainText("Day 1 / 50");

  // ─── Step 6: Navigate to log screen, fill form, submit ───────────────────
  // Click "Log an activity" link on the dashboard.
  await page.getByRole("link", { name: /log an activity/i }).click();
  await page.waitForURL(`/challenges/${challengeId}/log`, { timeout: 10_000 });

  // Fill in the amount (TARGET challenge, unit: min).
  const amountInput = page.getByTestId("amount-input");
  await expect(amountInput).toBeVisible();
  await amountInput.fill("60");

  // Submit the form.
  await page.getByRole("button", { name: /log activity/i }).click();

  // After successful submission the form POSTs and redirects to "/".
  await page.waitForURL("/", { timeout: 10_000 });

  // ─── Step 7: Dashboard shows completion ──────────────────────────────────
  // The ProgressRing SVG has aria-label = "${ringValue} / ${ringMax} ${unit}".
  // For 60/60 min it will be "60 / 60 min".
  const ring = page.getByRole("img", { name: /60 \/ 60 min/i });
  await expect(ring).toBeVisible({ timeout: 10_000 });

  // ─── Step 8: Feed page loads without error ────────────────────────────────
  await page.goto("/feed");
  // This user has no followees, so the empty-state renders.
  // Either the empty-state or the Feed heading must be present.
  const feedEmpty = page.getByTestId("feed-empty");
  const feedHeading = page.getByRole("heading", { name: /feed/i });
  await expect(feedEmpty.or(feedHeading)).toBeVisible({ timeout: 10_000 });
});
