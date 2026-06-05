/**
 * Unit tests for config.ts — the API base URL resolver.
 *
 * Precedence under test: EXPO_PUBLIC_API_BASE_URL override → __DEV__ localhost
 * → prod domain, plus trailing-slash/whitespace normalisation.
 *
 * NOTE: Expo/jest-expo inlines `process.env.EXPO_PUBLIC_*` at transform time, so
 * the override cannot be mutated at runtime in a test. We therefore exercise the
 * override precedence through the pure `resolveApiBaseUrlFrom(override)` helper,
 * and exercise the dev/prod build branch through `resolveApiBaseUrl()` (which
 * reads the inlined env — undefined under jest — so it falls through to the
 * __DEV__ branch we toggle here).
 */

import {
  resolveApiBaseUrl,
  resolveApiBaseUrlFrom,
  API_BASE_URL,
  PROD_API_BASE_URL,
  DEV_API_BASE_URL,
} from "./config";

const REAL_DEV = (globalThis as { __DEV__?: boolean }).__DEV__;

function setDev(value: boolean | undefined): void {
  if (value === undefined) {
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
  } else {
    (globalThis as { __DEV__?: boolean }).__DEV__ = value;
  }
}

afterEach(() => {
  setDev(REAL_DEV);
});

describe("constants", () => {
  it("points the prod default at https://www.project50.fit", () => {
    expect(PROD_API_BASE_URL).toBe("https://www.project50.fit");
  });

  it("points the dev default at localhost (no hardcoded LAN IP)", () => {
    expect(DEV_API_BASE_URL).toBe("http://localhost:3000");
  });
});

describe("resolveApiBaseUrlFrom (pure override resolver)", () => {
  it("returns the prod domain in a production build with no override", () => {
    setDev(false);
    expect(resolveApiBaseUrlFrom(undefined)).toBe("https://www.project50.fit");
  });

  it("returns localhost in a dev build with no override", () => {
    setDev(true);
    expect(resolveApiBaseUrlFrom(undefined)).toBe("http://localhost:3000");
  });

  it("treats a missing __DEV__ global as production", () => {
    setDev(undefined);
    expect(resolveApiBaseUrlFrom(undefined)).toBe("https://www.project50.fit");
  });

  it("override wins over a dev build", () => {
    setDev(true);
    expect(resolveApiBaseUrlFrom("http://192.168.1.50:3000")).toBe("http://192.168.1.50:3000");
  });

  it("override wins over a production build", () => {
    setDev(false);
    expect(resolveApiBaseUrlFrom("https://staging.project50.fit")).toBe(
      "https://staging.project50.fit",
    );
  });

  it("ignores an empty-string override and falls through to the build default", () => {
    setDev(false);
    expect(resolveApiBaseUrlFrom("")).toBe("https://www.project50.fit");
  });

  it("ignores a whitespace-only override and falls through to the build default", () => {
    setDev(false);
    expect(resolveApiBaseUrlFrom("   ")).toBe("https://www.project50.fit");
  });

  it("trims surrounding whitespace and a trailing slash from the override", () => {
    setDev(false);
    expect(resolveApiBaseUrlFrom("  https://staging.project50.fit/  ")).toBe(
      "https://staging.project50.fit",
    );
  });

  it("strips multiple trailing slashes from the override", () => {
    setDev(false);
    expect(resolveApiBaseUrlFrom("http://localhost:3000///")).toBe("http://localhost:3000");
  });
});

describe("resolveApiBaseUrl (reads inlined env)", () => {
  it("falls through to the prod domain in a production build (no env override under jest)", () => {
    setDev(false);
    expect(resolveApiBaseUrl()).toBe("https://www.project50.fit");
  });

  it("falls through to localhost in a dev build (no env override under jest)", () => {
    setDev(true);
    expect(resolveApiBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("API_BASE_URL", () => {
  it("is a non-empty string resolved at module load", () => {
    expect(typeof API_BASE_URL).toBe("string");
    expect(API_BASE_URL.length).toBeGreaterThan(0);
  });
});
