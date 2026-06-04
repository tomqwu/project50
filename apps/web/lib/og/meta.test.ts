import { afterEach, describe, expect, it } from "vitest";
import {
  OG_BRAND,
  OG_CONTENT_TYPE,
  OG_DEFAULT_ALT,
  OG_RECAP_CACHE_CONTROL,
  OG_SIZE,
  resolveSiteUrl,
} from "./meta";

describe("OG shared meta", () => {
  it("exposes 1200x630 size", () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
  });

  it("uses image/png content type", () => {
    expect(OG_CONTENT_TYPE).toBe("image/png");
  });

  it("has the on-brand Momentum palette", () => {
    expect(OG_BRAND.background).toBe("#121013");
    expect(OG_BRAND.accent).toBe("#D6FF3F");
    expect(OG_BRAND.text).toBe("#ffffff");
  });

  it("default alt is the product tagline", () => {
    expect(OG_DEFAULT_ALT).toContain("project50");
    expect(OG_DEFAULT_ALT).toContain("50 days");
  });

  it("recap cache-control is short and revalidating, not immutable", () => {
    expect(OG_RECAP_CACHE_CONTROL).toBe("public, max-age=300, s-maxage=300");
    expect(OG_RECAP_CACHE_CONTROL).not.toContain("immutable");
  });
});

describe("resolveSiteUrl", () => {
  afterEach(() => {
    // no global env mutated; helper takes env arg
  });

  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    const url = resolveSiteUrl({
      NEXT_PUBLIC_SITE_URL: "https://project50.app",
      AUTH_URL: "https://auth.example.com",
    });
    expect(url.origin).toBe("https://project50.app");
  });

  it("falls back to AUTH_URL", () => {
    const url = resolveSiteUrl({
      AUTH_URL: "https://auth.example.com",
    });
    expect(url.origin).toBe("https://auth.example.com");
  });

  it("falls back to NEXTAUTH_URL", () => {
    const url = resolveSiteUrl({
      NEXTAUTH_URL: "https://nextauth.example.com",
    });
    expect(url.origin).toBe("https://nextauth.example.com");
  });

  it("falls back to localhost:3000 when unset", () => {
    const url = resolveSiteUrl({});
    expect(url.origin).toBe("http://localhost:3000");
  });

  it("skips a blank-string env value instead of crashing on new URL('')", () => {
    const url = resolveSiteUrl({ AUTH_URL: "", NEXTAUTH_URL: "" });
    expect(url.origin).toBe("http://localhost:3000");
  });

  it("skips whitespace-only values and trims the chosen one", () => {
    const url = resolveSiteUrl({
      NEXT_PUBLIC_SITE_URL: "   ",
      AUTH_URL: "  https://auth.example.com  ",
    });
    expect(url.origin).toBe("https://auth.example.com");
  });

  it("reads process.env by default", () => {
    expect(resolveSiteUrl()).toBeInstanceOf(URL);
  });
});
