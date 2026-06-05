import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { middleware } from "./middleware";
import { REFERRAL_COOKIE } from "./lib/referral-capture";
import type { NextRequest } from "next/server";

/** Build a minimal NextRequest-like object exposing only `nextUrl`. */
function reqFor(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

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

/**
 * The storage origin(s) must be allowed in connect/img/media-src so the browser
 * can PUT directly to the presigned URL and load media back. This is one of the
 * three ways Azure Blob upload was broken: the SAS PUT goes to
 * <account>.blob.core.windows.net, which CSP must allow.
 */
describe("security headers middleware — storage origins (CSP)", () => {
  const STORAGE_ENV = [
    "S3_PUBLIC_URL",
    "S3_ENDPOINT",
    "AZURE_STORAGE_ACCOUNT",
  ] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of STORAGE_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of STORAGE_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function csp(): string {
    return middleware().headers.get("content-security-policy") ?? "";
  }

  it("includes the S3 origin (from S3_PUBLIC_URL) in connect/img/media-src", () => {
    process.env.S3_PUBLIC_URL = "https://cdn.example.com/bucket";
    const c = csp();
    expect(c).toMatch(/connect-src [^;]*https:\/\/cdn\.example\.com/);
    expect(c).toMatch(/img-src [^;]*https:\/\/cdn\.example\.com/);
    expect(c).toMatch(/media-src [^;]*https:\/\/cdn\.example\.com/);
  });

  it("includes the Azure Blob origin when AZURE_STORAGE_ACCOUNT is set", () => {
    process.env.AZURE_STORAGE_ACCOUNT = "myacct";
    const c = csp();
    const azure = "https://myacct.blob.core.windows.net";
    expect(c).toMatch(new RegExp(`connect-src [^;]*${azure.replace(/\./g, "\\.")}`));
    expect(c).toMatch(new RegExp(`img-src [^;]*${azure.replace(/\./g, "\\.")}`));
    expect(c).toMatch(new RegExp(`media-src [^;]*${azure.replace(/\./g, "\\.")}`));
  });

  it("includes BOTH the S3 and Azure origins when both are configured", () => {
    process.env.S3_PUBLIC_URL = "https://cdn.example.com";
    process.env.AZURE_STORAGE_ACCOUNT = "myacct";
    const c = csp();
    expect(c).toContain("https://cdn.example.com");
    expect(c).toContain("https://myacct.blob.core.windows.net");
  });

  it("omits the Azure origin when AZURE_STORAGE_ACCOUNT is unset", () => {
    process.env.S3_PUBLIC_URL = "https://cdn.example.com";
    expect(csp()).not.toContain("blob.core.windows.net");
  });

  it("ignores an unparseable S3 endpoint (no bogus origin leaks in)", () => {
    process.env.S3_ENDPOINT = "::::not a url::::";
    const c = csp();
    // connect-src falls back to just 'self' (no storage origin appended).
    expect(c).toMatch(/connect-src 'self'(;| )/);
  });
});

describe("security headers middleware — referral capture (#266)", () => {
  it("captures ?ref=<code> into the p50_ref cookie (survives the auth redirect)", () => {
    const res = middleware(reqFor("https://app.test/?ref=ABCD2345"));
    const cookie = res.cookies.get(REFERRAL_COOKIE);
    expect(cookie?.value).toBe("ABCD2345");
    expect(cookie?.httpOnly).toBe(true);
    // Still emits the security headers on the same response.
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("does not set the cookie when there is no ?ref param", () => {
    const res = middleware(reqFor("https://app.test/dashboard"));
    expect(res.cookies.get(REFERRAL_COOKIE)).toBeUndefined();
  });

  it("ignores a garbage ?ref value (no cookie set)", () => {
    const res = middleware(reqFor("https://app.test/?ref=" + encodeURIComponent("../evil ")));
    expect(res.cookies.get(REFERRAL_COOKIE)).toBeUndefined();
  });

  it("still works (no throw) when called without a request — headers only", () => {
    const res = middleware();
    expect(res.headers.get("content-security-policy")).toBeTruthy();
    expect(res.cookies.get(REFERRAL_COOKIE)).toBeUndefined();
  });
});
