/**
 * E2E: photo upload round-trip against real MinIO.
 *
 * Flow:
 *   1. Sign in via e2e button.
 *   2. Create a PUBLIC challenge via API.
 *   3. Navigate to the log screen.
 *   4. Set the file input to the fixture PNG (test-photo.png, 10×10 red px).
 *   5. Wait for the presign + PUT to complete (thumbnail visible).
 *   6. Submit the form.
 *   7. Verify the activity photo renders on the feed (img with a signed URL).
 *
 * MinIO is started before the webServer via docker-compose (dev) or a docker
 * run step in CI. ensureBucket() is called by the presign route on first use,
 * so no manual bucket setup is needed.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PNG = path.join(__dirname, "fixtures/test-photo.png");

test("media upload: log activity with photo → photo renders in feed", async ({
  page,
}) => {
  const run = randomUUID();
  const handle = `e2e-media-${run}`;
  const todayKey = new Date().toISOString().slice(0, 10);

  // ─── Step 1: Sign in ─────────────────────────────────────────────────────
  await page.goto("/signin");
  await page.waitForURL(/\/signin/);
  // The e2e sign-in button auto-generates a unique handle
  const e2eButton = page.getByTestId("signin-e2e");
  await expect(e2eButton).toBeVisible({ timeout: 10_000 });

  // We need a specific handle for this test, so override via API sign-in
  const csrfRes = await page.request.get("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post("/api/auth/callback/e2e", {
    form: { csrfToken, handle, callbackUrl: "http://localhost:3000/", json: "true" },
  });

  // Navigate to dashboard to confirm authentication
  await page.goto("/");
  await page.waitForURL("/", { timeout: 15_000 });

  // ─── Step 2: Create a PUBLIC challenge via API ────────────────────────────
  const createRes = await page.request.post("/api/challenges", {
    data: {
      title: `E2E Media ${run}`,
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

  // ─── Step 3: Navigate to log screen ──────────────────────────────────────
  await page.goto(`/challenges/${challengeId}/log`);
  await page.waitForURL(`/challenges/${challengeId}/log`, { timeout: 10_000 });

  // Fill in a minimal amount
  const amountInput = page.getByTestId("amount-input");
  await expect(amountInput).toBeVisible({ timeout: 10_000 });
  await amountInput.fill("10");

  // ─── Step 4: Set the fixture PNG on the file input ────────────────────────
  const fileInput = page.getByTestId("photo-input");
  await fileInput.setInputFiles(FIXTURE_PNG);

  // ─── Step 5: Wait for the upload to complete (thumbnail visible) ──────────
  // The presign → PUT cycle must complete; expect preview within 30s.
  const photoPreview = page.getByTestId("photo-preview");
  await expect(photoPreview).toBeVisible({ timeout: 30_000 });

  // ─── Step 6: Submit the form ──────────────────────────────────────────────
  await page.getByRole("button", { name: /log activity/i }).click();
  await page.waitForURL("/", { timeout: 15_000 });

  // ─── Step 7: Verify photo renders for the challenge owner ────────────────
  // The owner sees their own challenge on the dashboard. Their own activities
  // appear on the celebrate page. Let's check the celebrate page for the photo.
  await page.goto(`/challenges/${challengeId}/celebrate`);
  await page.waitForURL(`/challenges/${challengeId}/celebrate`, { timeout: 10_000 });

  // The celebrate view renders celebrate-photo img when a photo URL is present.
  const celebratePhoto = page.getByTestId("celebrate-photo");
  await expect(celebratePhoto).toBeVisible({ timeout: 15_000 });

  // The src should be a signed S3/MinIO URL (contains "X-Amz-" signature params
  // or the MinIO endpoint hostname). In dev/CI it points to localhost:9000.
  const src = await celebratePhoto.getAttribute("src");
  expect(src).toBeTruthy();
  // The URL should contain the media object key pattern
  expect(src).toContain("media/");
});

test("media upload: photo renders in feed for followers", async ({ page, browser }) => {
  const run = randomUUID();
  const ownerHandle = `e2e-media-owner-${run}`;
  const followerHandle = `e2e-media-follower-${run}`;
  const todayKey = new Date().toISOString().slice(0, 10);

  // ─── Sign in as owner ─────────────────────────────────────────────────────
  const csrfRes = await page.request.get("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post("/api/auth/callback/e2e", {
    form: { csrfToken, handle: ownerHandle, callbackUrl: "http://localhost:3000/", json: "true" },
  });
  await page.goto("/");
  await page.waitForURL("/", { timeout: 15_000 });

  // Get owner's user ID from session
  const sessionRes = await page.request.get("/api/auth/session");
  const session = (await sessionRes.json()) as { user?: { id?: string } };
  const ownerId = session.user?.id;
  expect(ownerId).toBeTruthy();

  // Create PUBLIC challenge
  const createRes = await page.request.post("/api/challenges", {
    data: {
      title: `E2E Media Feed ${run}`,
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

  // Log activity with photo
  await page.goto(`/challenges/${challengeId}/log`);
  await page.waitForURL(`/challenges/${challengeId}/log`, { timeout: 10_000 });
  await page.getByTestId("amount-input").fill("10");

  const fileInput = page.getByTestId("photo-input");
  await fileInput.setInputFiles(FIXTURE_PNG);

  // Wait for upload to complete
  await expect(page.getByTestId("photo-preview")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /log activity/i }).click();
  await page.waitForURL("/", { timeout: 15_000 });

  // ─── Sign in as follower in a fresh context ───────────────────────────────
  const followerContext = await browser.newContext();
  try {
    const followerPage = await followerContext.newPage();

    const fCsrfRes = await followerPage.request.get("http://localhost:3000/api/auth/csrf");
    const { csrfToken: fCsrf } = (await fCsrfRes.json()) as { csrfToken: string };
    await followerPage.request.post("http://localhost:3000/api/auth/callback/e2e", {
      form: {
        csrfToken: fCsrf,
        handle: followerHandle,
        callbackUrl: "http://localhost:3000/",
        json: "true",
      },
    });

    // Follow the owner
    await followerPage.request.post(`http://localhost:3000/api/users/${ownerId}/follow`);

    // Check feed
    await followerPage.goto("http://localhost:3000/feed");
    await followerPage.waitForURL(/\/feed/, { timeout: 10_000 });

    // The feed should show the owner's activity with a photo
    const feedPhoto = followerPage.getByTestId("feed-photo");
    await expect(feedPhoto).toBeVisible({ timeout: 15_000 });

    const src = await feedPhoto.getAttribute("src");
    expect(src).toBeTruthy();
    expect(src).toContain("media/");
  } finally {
    await followerContext.close();
  }
});
