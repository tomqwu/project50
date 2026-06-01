/**
 * E2E: Recap video generation via fake renderer.
 *
 * Flow:
 *   1. Sign in via the e2e credentials provider.
 *   2. Create a PUBLIC challenge via API.
 *   3. Log an activity for today via API.
 *   4. Navigate to the celebrate page.
 *   5. Click "Day recap".
 *   6. Assert that a <video data-testid="recap-video"> appears with a src
 *      pointing at storage (contains "recap" and "media/").
 *
 * The webServer is started with RECAP_FAKE=1 (set in playwright.config.ts),
 * so the app uses FakeRecapRenderer — no heavy Chromium Remotion render.
 * A tiny valid MP4 is stored in MinIO and served via a signed URL.
 */

import { test, expect } from "@playwright/test";

test("recap: click Day recap on celebrate → video appears with storage src", async ({
  page,
}) => {
  const run = `${Date.now()}`;
  const handle = `e2e-recap-${run}`;
  const todayKey = new Date().toISOString().slice(0, 10);

  // ─── Step 1: Sign in ─────────────────────────────────────────────────────
  const csrfRes = await page.request.get("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post("/api/auth/callback/e2e", {
    form: { csrfToken, handle, callbackUrl: "http://localhost:3000/", json: "true" },
  });

  // Verify auth by navigating to dashboard
  await page.goto("/");
  await page.waitForURL("/", { timeout: 15_000 });

  // ─── Step 2: Create a PUBLIC challenge via API ────────────────────────────
  const createRes = await page.request.post("/api/challenges", {
    data: {
      title: `E2E Recap ${run}`,
      goalType: "TARGET",
      dailyTarget: 10,
      unit: "min",
      startDate: todayKey,
      timezone: "UTC",
      visibility: "PUBLIC",
    },
  });
  expect(createRes.status()).toBe(201);
  const { id: challengeId } = (await createRes.json()) as { id: string };

  // ─── Step 3: Log an activity for today ───────────────────────────────────
  const logRes = await page.request.post(`/api/challenges/${challengeId}/activities`, {
    data: { dayKey: todayKey, amount: 10 },
  });
  expect(logRes.status()).toBe(201);

  // ─── Step 4: Navigate to the celebrate page ───────────────────────────────
  await page.goto(`/challenges/${challengeId}/celebrate`);
  await page.waitForURL(`/challenges/${challengeId}/celebrate`, { timeout: 15_000 });

  // The RecapPanel should be visible
  const recapPanel = page.getByTestId("recap-panel");
  await expect(recapPanel).toBeVisible({ timeout: 10_000 });

  // ─── Step 5: Click "Day recap" button ────────────────────────────────────
  const dayBtnWrapper = page.getByTestId("recap-btn-DAY");
  await expect(dayBtnWrapper).toBeVisible({ timeout: 10_000 });
  await dayBtnWrapper.locator("button").click();

  // ─── Step 6: Assert the video appears with a storage src ─────────────────
  // The fake renderer produces a tiny valid MP4 → uploaded to MinIO →
  // returned as a presigned URL (contains "media/" and "recap" in the key).
  const video = page.getByTestId("recap-video");
  await expect(video).toBeVisible({ timeout: 30_000 });

  const src = await video.getAttribute("src");
  expect(src).toBeTruthy();
  // The objectKey is media/<userId>/recap-DAY-<timestamp>.mp4
  // The presigned URL will contain "media/" and "recap" from the key
  expect(src).toContain("media/");
  expect(src).toContain("recap");
});
