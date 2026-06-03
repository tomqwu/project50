/**
 * OAuth redirect guard (M0 #36).
 *
 * Regression test for the empty-client_id bug that shipped silently: clicking a
 * provider sign-in button must redirect to that provider's authorize endpoint
 * with a NON-EMPTY client_id and the correct redirect_uri back to our callback.
 *
 * The provider authorize request is intercepted and aborted, so the test never
 * hits the real provider or completes an OAuth round-trip — it only inspects the
 * outbound URL. Test-only client ids are injected via the Playwright webServer
 * env (playwright.config.ts: GOOGLE_CLIENT_ID / FACEBOOK_CLIENT_ID).
 */

import { test, expect } from "@playwright/test";

const CASES = [
  {
    name: "Google",
    testid: "signin-google",
    hostNeedle: "google.com",
    callbackPath: "/api/auth/callback/google",
    expectedClientId: "e2e-google-client-id",
  },
  {
    name: "Facebook",
    testid: "signin-facebook",
    hostNeedle: "facebook.com",
    callbackPath: "/api/auth/callback/facebook",
    expectedClientId: "e2e-facebook-client-id",
  },
] as const;

for (const c of CASES) {
  test(`${c.name}: sign-in redirects to the provider with a non-empty client_id + correct redirect_uri`, async ({
    page,
  }) => {
    const hostRe = new RegExp(c.hostNeedle.replace(".", "\\."));

    // Abort the outbound authorize navigation — we only want to read its URL,
    // never load the real provider.
    await page.route(hostRe, (route) => route.abort());

    await page.goto("/signin");

    const [authorizeRequest] = await Promise.all([
      page.waitForRequest(hostRe, { timeout: 15_000 }),
      page.getByTestId(c.testid).click(),
    ]);

    const url = new URL(authorizeRequest.url());

    // Host is the provider.
    expect(url.host).toContain(c.hostNeedle);
    // client_id is present AND non-empty (the bug shipped an empty one).
    const clientId = url.searchParams.get("client_id");
    expect(clientId).toBeTruthy();
    expect(clientId).toBe(c.expectedClientId);
    // redirect_uri points back to our callback for this provider.
    expect(url.searchParams.get("redirect_uri")).toContain(c.callbackPath);
    // Standard authorization-code request.
    expect(url.searchParams.get("response_type")).toBe("code");
  });
}
