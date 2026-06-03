import { describe, it, expect } from "vitest";
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  parseAuthSecrets,
  shouldUseSecureCookies,
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
