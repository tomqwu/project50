/**
 * Security headers (M0 #31).
 *
 * Asserts the hardening headers set by middleware.ts are present on app
 * responses and that the CSP locks down the high-value directives. The rest of
 * the e2e suite (sign-in, Project 50, media, feed, recap) is what proves the app
 * still FUNCTIONS under this policy.
 *
 * Note: script-src/style-src allow 'unsafe-inline' by design (see middleware.ts)
 * — a nonce-based script CSP is infeasible with this app's statically-rendered
 * routes. The protections this test guards are the structural ones.
 */

import { test, expect } from "@playwright/test";

test("hardening headers + locked-down CSP directives are present", async ({ page }) => {
  const res = await page.request.get("/signin");
  const headers = res.headers();

  const csp = headers["content-security-policy"];
  expect(csp, "CSP header should be set").toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  // High-value structural lockdowns.
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toMatch(/form-action [^;]*'self'/);

  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
});
