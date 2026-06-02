/**
 * E2E journey: auth + API end-to-end over the real running Next.js server.
 *
 * Sign-in method used: programmatic CSRF + credentials callback POST.
 *   1. GET /api/auth/csrf  → { csrfToken }, also sets the csrf-token cookie.
 *   2. POST /api/auth/callback/e2e (form-encoded: csrfToken + handle + callbackUrl)
 *      → NextAuth issues a session-token cookie (JWT).
 *   3. Subsequent requests carry the session cookie automatically (Playwright
 *      APIRequestContext persists cookies across calls within one test).
 *
 * NextAuth v5 (beta.31) path notes:
 *   - basePath defaults to /api/auth (set by next-auth/lib/env.js).
 *   - Credentials callback path is /api/auth/callback/<providerId>,
 *     so our e2e provider → /api/auth/callback/e2e.
 *   - CSRF is required for the credentials POST; we obtain it via GET /api/auth/csrf
 *     which sets the csrf-token cookie AND returns { csrfToken } JSON.
 */

import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("auth + API journey: create challenge, log activity, verify completion + streak", async ({
  request,
}, testInfo) => {
  // Unique handle per run to avoid collisions with prior runs in the same DB.
  const handle = `e2e-${testInfo.workerIndex}-journey-${randomUUID()}`;

  // ─── Step 1: Obtain CSRF token ────────────────────────────────────────────
  const csrfRes = await request.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  expect(typeof csrfToken).toBe("string");
  expect(csrfToken.length).toBeGreaterThan(0);

  // ─── Step 2: Sign in via the e2e Credentials provider ────────────────────
  // The provider id is "e2e", so the callback path is /api/auth/callback/e2e.
  // NextAuth requires a form-encoded POST with the csrfToken matching the
  // csrf-token cookie that was set in step 1.
  const signInRes = await request.post("/api/auth/callback/e2e", {
    form: {
      csrfToken,
      handle,
      callbackUrl: "http://localhost:3000/",
      json: "true",
    },
  });
  // NextAuth responds with a redirect (302) or a 200 depending on the client.
  // Playwright follows redirects by default; what matters is that a session
  // cookie was issued. We accept 200 or any 3xx that resolved to 200.
  expect(
    signInRes.ok() || signInRes.status() === 302 || signInRes.status() === 200,
  ).toBeTruthy();

  // ─── Step 3: Confirm session ──────────────────────────────────────────────
  const sessionRes = await request.get("/api/auth/session");
  expect(sessionRes.ok()).toBeTruthy();
  const session = (await sessionRes.json()) as {
    user?: { id?: string; name?: string };
  };
  expect(session.user).toBeDefined();
  expect(typeof session.user?.id).toBe("string");
  expect(session.user!.id!.length).toBeGreaterThan(0);
  const userId = session.user!.id!;

  // ─── Step 4: Create a challenge ───────────────────────────────────────────
  const createRes = await request.post("/api/challenges", {
    data: {
      title: "E2E Workout",
      goalType: "TARGET",
      dailyTarget: 60,
      unit: "min",
      startDate: "2026-06-01",
      timezone: "UTC",
    },
  });
  // Route returns 201 on success.
  expect(createRes.status()).toBe(201);
  const challenge = (await createRes.json()) as { id: string };
  expect(typeof challenge.id).toBe("string");
  const challengeId = challenge.id;

  // ─── Step 5: Log activity for today ──────────────────────────────────────
  const logRes = await request.post(`/api/challenges/${challengeId}/activities`, {
    data: {
      dayKey: "2026-06-01",
      amount: 60,
    },
  });
  expect(logRes.status()).toBe(201);
  const logBody = (await logRes.json()) as {
    dayStatus?: { completed?: boolean };
  };
  // The activity route returns { activity, dayStatus, newMilestones }.
  expect(logBody.dayStatus?.completed).toBe(true);

  // ─── Step 6: Read back the challenge and verify streak ───────────────────
  const getRes = await request.get(`/api/challenges/${challengeId}`);
  expect(getRes.ok()).toBeTruthy();
  const challengeData = (await getRes.json()) as {
    id: string;
    currentStreak: number;
    dayStatuses?: Array<{ dayKey: string; completed: boolean }>;
  };
  expect(challengeData.id).toBe(challengeId);
  expect(challengeData.currentStreak).toBeGreaterThanOrEqual(1);

  // Verify the day status for 2026-06-01 is completed.
  const day = challengeData.dayStatuses?.find((d) => d.dayKey === "2026-06-01");
  expect(day).toBeDefined();
  expect(day?.completed).toBe(true);

  // Also confirm the challenge belongs to the signed-in user (sanity check).
  // userId is set from the session; we don't expose ownerId in getChallenge
  // response directly, but we can list challenges and verify ours is present.
  const listRes = await request.get("/api/challenges");
  expect(listRes.ok()).toBeTruthy();
  const challenges = (await listRes.json()) as Array<{ id: string }>;
  const found = challenges.find((c) => c.id === challengeId);
  expect(found).toBeDefined();

  // Suppress unused-variable lint warning: userId is confirmed via session.
  void userId;
});

test("unauthenticated request is rejected with 401", async () => {
  // Use a FRESH request context with no cookies so there is no session.
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const freshRequest = context.request;

  const feedRes = await freshRequest.get("http://localhost:3000/api/feed");
  expect(feedRes.status()).toBe(401);

  await browser.close();
});
