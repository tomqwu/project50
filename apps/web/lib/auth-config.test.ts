import { describe, it, expect } from "vitest";
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  parseAuthSecrets,
  shouldUseSecureCookies,
  shouldRegisterE2eProvider,
} from "./auth-config";

describe("session lifetimes", () => {
  it("expires sessions after 30 days and rolls them forward at most daily", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
    expect(SESSION_UPDATE_AGE_SECONDS).toBe(60 * 60 * 24);
    expect(SESSION_UPDATE_AGE_SECONDS).toBeLessThan(SESSION_MAX_AGE_SECONDS);
  });
});

describe("parseAuthSecrets", () => {
  it("returns undefined when unset or empty", () => {
    expect(parseAuthSecrets(undefined)).toBeUndefined();
    expect(parseAuthSecrets("")).toBeUndefined();
    expect(parseAuthSecrets("   ")).toBeUndefined();
    expect(parseAuthSecrets(",")).toBeUndefined();
  });

  it("returns a single string for one secret (back-compat)", () => {
    expect(parseAuthSecrets("only-secret")).toBe("only-secret");
    expect(parseAuthSecrets("  trimmed  ")).toBe("trimmed");
  });

  it("returns an ordered array for rotation (new first, old retained)", () => {
    expect(parseAuthSecrets("new,old")).toEqual(["new", "old"]);
    expect(parseAuthSecrets(" new , , old ")).toEqual(["new", "old"]);
  });
});

describe("shouldUseSecureCookies", () => {
  it("forces secure cookies when AUTH_URL is https", () => {
    expect(shouldUseSecureCookies({ AUTH_URL: "https://app.example.com" })).toBe(true);
  });

  it("uses NEXTAUTH_URL as a fallback", () => {
    expect(shouldUseSecureCookies({ NEXTAUTH_URL: "https://app.example.com" })).toBe(true);
  });

  it("returns undefined for http or when no URL is configured", () => {
    expect(shouldUseSecureCookies({ AUTH_URL: "http://localhost:3000" })).toBeUndefined();
    expect(shouldUseSecureCookies({})).toBeUndefined();
  });
});

describe("shouldRegisterE2eProvider (production safety guard)", () => {
  // Gate 1 — AUTH_E2E === "1" is the primary gate.
  it("returns false when AUTH_E2E is unset", () => {
    expect(shouldRegisterE2eProvider({})).toBe(false);
  });

  it("returns false when AUTH_E2E is set to anything other than '1'", () => {
    expect(shouldRegisterE2eProvider({ AUTH_E2E: "0" })).toBe(false);
    expect(shouldRegisterE2eProvider({ AUTH_E2E: "true" })).toBe(false);
    expect(shouldRegisterE2eProvider({ AUTH_E2E: "yes" })).toBe(false);
  });

  // Non-production: AUTH_E2E=1 is enough (dev + vitest + Playwright dev server).
  it("returns true in non-production when AUTH_E2E=1", () => {
    expect(shouldRegisterE2eProvider({ AUTH_E2E: "1", NODE_ENV: "test" })).toBe(true);
    expect(shouldRegisterE2eProvider({ AUTH_E2E: "1", NODE_ENV: "development" })).toBe(true);
    expect(shouldRegisterE2eProvider({ AUTH_E2E: "1" })).toBe(true);
  });

  // Production hard guard — the dev/e2e login path must NEVER silently activate.
  it("returns false in production when AUTH_E2E=1 but the escape hatch is absent", () => {
    expect(shouldRegisterE2eProvider({ AUTH_E2E: "1", NODE_ENV: "production" })).toBe(false);
  });

  // The single documented escape hatch keeps the CI e2e server (next start over
  // http with NODE_ENV=production) working.
  it("returns true in production ONLY with the exact escape hatch AUTH_E2E_ALLOW_PROD=1", () => {
    expect(
      shouldRegisterE2eProvider({
        AUTH_E2E: "1",
        NODE_ENV: "production",
        AUTH_E2E_ALLOW_PROD: "1",
      }),
    ).toBe(true);
  });

  // Misconfiguration: AUTH_E2E_ALLOW_PROD set truthy but NOT the documented "1"
  // value in production → throw a clear startup error rather than guess intent.
  it("throws in production when AUTH_E2E_ALLOW_PROD is truthy but not the exact '1' escape hatch", () => {
    for (const bad of ["true", "yes", "0 ", "TRUE", "2", "on"]) {
      expect(() =>
        shouldRegisterE2eProvider({
          AUTH_E2E: "1",
          NODE_ENV: "production",
          AUTH_E2E_ALLOW_PROD: bad,
        }),
      ).toThrow(/AUTH_E2E_ALLOW_PROD/);
    }
  });

  // An empty-string AUTH_E2E_ALLOW_PROD is treated as "unset" (the .env.example
  // ships it blank) → no throw, just refuse the provider.
  it("does NOT throw when AUTH_E2E_ALLOW_PROD is empty in production (treated as unset)", () => {
    expect(
      shouldRegisterE2eProvider({
        AUTH_E2E: "1",
        NODE_ENV: "production",
        AUTH_E2E_ALLOW_PROD: "",
      }),
    ).toBe(false);
  });

  // If AUTH_E2E itself is not the primary "1" gate, a stray AUTH_E2E_ALLOW_PROD
  // in production must NOT throw — the e2e path is already inert.
  it("does NOT throw in production when AUTH_E2E is not '1', even if AUTH_E2E_ALLOW_PROD is set", () => {
    expect(
      shouldRegisterE2eProvider({
        NODE_ENV: "production",
        AUTH_E2E_ALLOW_PROD: "true",
      }),
    ).toBe(false);
  });

  // Defaults to process.env when called without an explicit env (used by auth.ts).
  it("reads process.env by default", () => {
    const saved = process.env.AUTH_E2E;
    delete process.env.AUTH_E2E;
    try {
      expect(shouldRegisterE2eProvider()).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.AUTH_E2E;
      else process.env.AUTH_E2E = saved;
    }
  });
});
