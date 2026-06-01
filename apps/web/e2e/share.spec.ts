/**
 * E2E sharing flow: browser-driven test for the create-challenge UI,
 * activity logging, celebrate page, public share link, public page, and card image.
 *
 * Sign-in: click the e2e button on /signin (AUTH_E2E=1 in webServer env).
 * Unique handle/title per run so the e2e DB (not reset) stays collision-free.
 */

import { test, expect, Browser } from "@playwright/test";

test("sharing flow: create PUBLIC challenge, log activity, celebrate, share link, public page, card image", async ({
  page,
  browser,
}: {
  page: ReturnType<Browser["newPage"]> extends Promise<infer T> ? T : never;
  browser: Browser;
}) => {
  const run = `${Date.now()}`;
  const challengeTitle = `E2E Share ${run}`;
  const todayKey = new Date().toISOString().slice(0, 10);

  // ─── Step 1: Sign in via the e2e button ─────────────────────────────────
  await page.goto("/signin");
  await page.waitForURL(/\/signin/);
  const e2eButton = page.getByTestId("signin-e2e");
  await expect(e2eButton).toBeVisible({ timeout: 10_000 });
  await e2eButton.click();
  // Land on the dashboard
  await page.waitForURL("/", { timeout: 15_000 });
  expect(page.url()).toMatch(/\/$/);

  // ─── Step 2: Create a PUBLIC TARGET challenge via the UI ─────────────────
  await page.goto("/challenges/new");
  await page.waitForURL(/\/challenges\/new/, { timeout: 10_000 });

  // Fill the form
  const titleInput = page.getByTestId("title-input");
  await expect(titleInput).toBeVisible({ timeout: 10_000 });
  await titleInput.fill(challengeTitle);

  // goalType TARGET is already the default — confirm the radio is selected
  const targetRadio = page.getByTestId("goaltype-target");
  await expect(targetRadio).toBeChecked();

  // Fill unit and daily target (TARGET-only fields)
  await page.getByTestId("unit-input").fill("min");
  await page.getByTestId("daily-target-input").fill("30");

  // Set start date to today UTC
  await page.getByTestId("start-date-input").fill(todayKey);

  // Set visibility to PUBLIC (it defaults to PUBLIC, but set explicitly)
  await page.getByTestId("visibility-select").selectOption("PUBLIC");

  // Submit the form → should redirect to /
  await page.getByRole("button", { name: /create challenge/i }).click();
  await page.waitForURL("/", { timeout: 15_000 });
  expect(page.url()).toMatch(/\/$/);

  // ─── Step 3: Retrieve the new challenge ID from the API ─────────────────
  // page.request shares the browser session cookie, so we're authenticated.
  const listRes = await page.request.get("/api/challenges");
  expect(listRes.ok()).toBeTruthy();
  const challenges = (await listRes.json()) as Array<{ id: string; title: string }>;
  const newChallenge = challenges.find((c) => c.title === challengeTitle);
  expect(newChallenge).toBeDefined();
  const challengeId = newChallenge!.id;

  // ─── Step 4: Log an activity meeting the target ──────────────────────────
  // Navigate directly to the log screen
  await page.goto(`/challenges/${challengeId}/log`);
  await page.waitForURL(`/challenges/${challengeId}/log`, { timeout: 10_000 });

  const amountInput = page.getByTestId("amount-input");
  await expect(amountInput).toBeVisible({ timeout: 10_000 });
  await amountInput.fill("30");

  await page.getByRole("button", { name: /log activity/i }).click();
  // After submission it redirects to /
  await page.waitForURL("/", { timeout: 10_000 });

  // ─── Step 5: Open the celebrate page and verify it renders ──────────────
  await page.goto(`/challenges/${challengeId}/celebrate`);
  await page.waitForURL(`/challenges/${challengeId}/celebrate`, { timeout: 10_000 });

  // The celebrate title renders the challenge title (since dayNumber < 50)
  const celebrateTitle = page.getByTestId("celebrate-title");
  await expect(celebrateTitle).toBeVisible({ timeout: 10_000 });
  await expect(celebrateTitle).toContainText(challengeTitle);

  // ─── Step 6: Get the shareId and assert the clipboard contains /c/<shareId>
  // First, retrieve the challenge detail to get the shareId.
  const challengeRes = await page.request.get(`/api/challenges/${challengeId}`);
  expect(challengeRes.ok()).toBeTruthy();
  const challengeData = (await challengeRes.json()) as {
    id: string;
    shareId: string;
    visibility: string;
  };
  expect(challengeData.shareId).toBeTruthy();
  const shareId = challengeData.shareId;

  // Grant clipboard permissions to this browser context and click "Public link"
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  const copyLinkWrapper = page.getByTestId("copy-link-button");
  await expect(copyLinkWrapper).toBeVisible({ timeout: 10_000 });
  // Click the button inside the wrapper
  await copyLinkWrapper.getByRole("button").click();

  // Verify clipboard contains the public URL
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain(`/c/${shareId}`);

  // Also verify the button shows the "Copied" state (UI feedback)
  await expect(copyLinkWrapper.getByRole("button")).toHaveText("Copied", {
    timeout: 3_000,
  });

  // ─── Step 7: Fresh unauthenticated context — open /c/<shareId> ──────────
  const freshContext = await browser.newContext();
  try {
    const freshPage = await freshContext.newPage();
    await freshPage.goto(`http://localhost:3000/c/${shareId}`);

    // The public page reuses CelebrateView; the challenge title must be visible.
    const publicTitle = freshPage.getByTestId("celebrate-title");
    await expect(publicTitle).toBeVisible({ timeout: 15_000 });
    await expect(publicTitle).toContainText(challengeTitle);

    // The wordmark and "Start your own" link are also rendered by the public shell.
    await expect(freshPage.getByTestId("wordmark")).toBeVisible();
    await expect(freshPage.getByTestId("start-own-link")).toBeVisible();
  } finally {
    await freshContext.close();
  }

  // ─── Step 8: Assert GET /api/challenges/:id/card → 200 image/png ────────
  // The card route is PUBLIC (no auth required), so we can use page.request
  // (authed) or a fresh request — using page.request for simplicity.
  const cardRes = await page.request.get(`/api/challenges/${challengeId}/card`);
  expect(cardRes.status()).toBe(200);
  const contentType = cardRes.headers()["content-type"] ?? "";
  expect(contentType.startsWith("image/png")).toBeTruthy();

  // ─── Step 9 (optional): PRIVATE challenge card → 404 ────────────────────
  // Create a PRIVATE challenge via the API and confirm card returns 404.
  const privateRes = await page.request.post("/api/challenges", {
    data: {
      title: `E2E Private ${run}`,
      goalType: "BINARY",
      startDate: todayKey,
      timezone: "UTC",
      visibility: "PRIVATE",
    },
  });
  expect(privateRes.status()).toBe(201);
  const privateChallenge = (await privateRes.json()) as { id: string };
  const privateCardRes = await page.request.get(
    `/api/challenges/${privateChallenge.id}/card`,
  );
  expect(privateCardRes.status()).toBe(404);
});
