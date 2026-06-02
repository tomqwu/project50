/**
 * E2E: Social share panel on the celebrate page.
 *
 * Flow:
 *   1. Sign in via the e2e credentials provider (CSRF + callback POST).
 *   2. Create a PUBLIC challenge via API.
 *   3. Log an activity for today via API.
 *   4. Navigate to the celebrate page.
 *   5. Assert the SocialShare panel renders with Facebook, Instagram, WeChat buttons.
 *   6. Assert honest capability labels (no API creds → NOT "Post to X").
 *   7. Select "Image card" asset (default).
 *   8. Stub window.open via page.evaluate, click Facebook.
 *   9. Assert window.open was called with a facebook.com/sharer URL containing the card path.
 *  10. Assert NO "Posted!" text is visible (DEEPLINK never shows "Posted!").
 *
 * No real social posting. Platform APIs are unconfigured in the e2e environment
 * (no FB_PAGE_ID, IG_USER_ID, WECHAT_APP_ID) so all results use DEEPLINK/WEBSHARE.
 */

import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("social: celebrate page shows SocialShare panel with honest labels; Facebook deeplink opens sharer", async ({
  page,
}) => {
  const run = randomUUID();
  const handle = `e2e-social-${run}`;
  const todayKey = new Date().toISOString().slice(0, 10);

  // ─── Step 1: Sign in ─────────────────────────────────────────────────────
  const csrfRes = await page.request.get("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post("/api/auth/callback/e2e", {
    form: { csrfToken, handle, callbackUrl: "http://localhost:3000/", json: "true" },
  });

  // Verify auth
  await page.goto("/");
  await page.waitForURL("/", { timeout: 15_000 });

  // ─── Step 2: Create a PUBLIC challenge via API ────────────────────────────
  const createRes = await page.request.post("/api/challenges", {
    data: {
      title: `E2E Social ${run}`,
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

  // ─── Step 3: Log an activity for today via API ────────────────────────────
  const logRes = await page.request.post(`/api/challenges/${challengeId}/activities`, {
    data: { dayKey: todayKey, amount: 10 },
  });
  expect(logRes.status()).toBe(201);

  // ─── Step 4: Navigate to the celebrate page ───────────────────────────────
  await page.goto(`/challenges/${challengeId}/celebrate`);
  await page.waitForURL(`/challenges/${challengeId}/celebrate`, { timeout: 15_000 });

  // ─── Step 5: Assert SocialShare panel renders ─────────────────────────────
  const panel = page.getByTestId("social-share-panel");
  await expect(panel).toBeVisible({ timeout: 10_000 });

  // Assert all three platform buttons are present
  const fbPlatform = page.getByTestId("platform-FACEBOOK");
  const igPlatform = page.getByTestId("platform-INSTAGRAM");
  const wcPlatform = page.getByTestId("platform-WECHAT");

  await expect(fbPlatform).toBeVisible({ timeout: 10_000 });
  await expect(igPlatform).toBeVisible({ timeout: 10_000 });
  await expect(wcPlatform).toBeVisible({ timeout: 10_000 });

  // ─── Step 6: Assert honest capability labels ──────────────────────────────
  // No platform API creds configured in e2e env → buttons should NOT say "Post to Facebook"
  const fbBtn = fbPlatform.locator("button");
  const igBtn = igPlatform.locator("button");
  const wcBtn = wcPlatform.locator("button");

  // Should say "Facebook", "Instagram", "WeChat" — not "Post to Facebook" etc.
  await expect(fbBtn).toHaveText("Facebook");
  await expect(igBtn).toHaveText("Instagram");
  await expect(wcBtn).toHaveText("WeChat");

  // Subtitles should be visible (reason text from capabilities)
  const fbSubtitle = page.getByTestId("platform-subtitle-FACEBOOK");
  await expect(fbSubtitle).toBeVisible();
  // Facebook's unconfigured reason
  await expect(fbSubtitle).toContainText("Facebook publishing not configured");

  // ─── Step 7: Assert Image card is selected by default ────────────────────
  const imageToggle = page.getByTestId("asset-image");
  await expect(imageToggle).toHaveAttribute("aria-pressed", "true");

  // ─── Step 8: Stub window.open and click Facebook ─────────────────────────
  // Inject a stub for window.open that records the call arguments
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__openCalls__ = [];
    window.open = (url?: string | URL, ...args: unknown[]) => {
      (window as unknown as Record<string, unknown[]>).__openCalls__.push({ url, args });
      return null;
    };
  });

  await fbBtn.click();

  // Wait for the publish API to respond and window.open to be called
  await page.waitForFunction(
    () => {
      const calls = (window as unknown as Record<string, unknown[]>).__openCalls__;
      return Array.isArray(calls) && calls.length > 0;
    },
    { timeout: 15_000 },
  );

  // ─── Step 9: Assert window.open was called with facebook sharer URL ───────
  const openCalls = await page.evaluate(
    () => (window as unknown as Record<string, unknown[]>).__openCalls__,
  );
  expect(openCalls).toHaveLength(1);
  const openCall = openCalls[0] as { url: string; args: unknown[] };
  expect(openCall.url).toContain("facebook.com/sharer");
  // The URL should contain the encoded card path for this challenge
  expect(openCall.url).toContain(encodeURIComponent(`/api/challenges/${challengeId}/card`));

  // ─── Step 10: Assert NO "Posted!" text visible ────────────────────────────
  // For a DEEPLINK result, the component shows "Opening share…" not "Posted!"
  await expect(page.getByTestId(`platform-success-FACEBOOK`)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId(`platform-success-FACEBOOK`)).toContainText("Opening share");
  // Crucially, "Posted!" must never appear
  await expect(page.locator("text=Posted!")).not.toBeVisible();
});
