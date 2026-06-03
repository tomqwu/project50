import { describe, it, expect, afterEach } from "vitest";
import { middleware } from "./middleware";

/**
 * Guards the dev/prod CSP split. The e2e suite runs the production build
 * (`next start`), so it can't catch a CSP that breaks `next dev` — which is
 * exactly what happened: the strict prod `script-src` blocked the eval that
 * Fast Refresh/HMR needs, leaving every button dead in development.
 */
function cspFor(nodeEnv: string): string {
  const original = process.env.NODE_ENV;
  Object.defineProperty(process.env, "NODE_ENV", { value: nodeEnv, configurable: true, writable: true, enumerable: true });
  try {
    return middleware().headers.get("content-security-policy") ?? "";
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", { value: original, configurable: true, writable: true, enumerable: true });
  }
}

afterEach(() => {
  Object.defineProperty(process.env, "NODE_ENV", { value: "test", configurable: true, writable: true, enumerable: true });
});

describe("security headers middleware CSP", () => {
  it("development allows 'unsafe-eval' + ws (next dev HMR needs them)", () => {
    const csp = cspFor("development");
    expect(csp).toMatch(/script-src [^;]*'unsafe-eval'/);
    expect(csp).toMatch(/connect-src [^;]*ws:/);
  });

  it("production does NOT allow 'unsafe-eval' or ws (stays strict)", () => {
    const csp = cspFor("production");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/connect-src [^;]*ws:/);
  });

  it("always sets the structural lockdowns + hardening headers", () => {
    const res = middleware();
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });
});
