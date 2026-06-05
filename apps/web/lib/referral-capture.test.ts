import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  isValidReferralCode,
  captureReferralFromRequest,
  parseReferralCookie,
} from "./referral-capture";

describe("isValidReferralCode", () => {
  it("accepts a well-formed code (alphabet + length of a generated code)", () => {
    expect(isValidReferralCode("ABCD2345")).toBe(true);
  });

  it("accepts a longer/shorter alphanumeric code within bounds", () => {
    expect(isValidReferralCode("AB23")).toBe(true);
    expect(isValidReferralCode("ABCDEFGHJKLMNPQR")).toBe(true);
  });

  it("rejects empty, whitespace, and over-long values", () => {
    expect(isValidReferralCode("")).toBe(false);
    expect(isValidReferralCode("   ")).toBe(false);
    expect(isValidReferralCode("A".repeat(65))).toBe(false);
  });

  it("rejects codes with disallowed characters (no injection of slashes/spaces)", () => {
    expect(isValidReferralCode("ABC DEF")).toBe(false);
    expect(isValidReferralCode("ABC/DEF")).toBe(false);
    expect(isValidReferralCode("ABC;DEF")).toBe(false);
    expect(isValidReferralCode("ABC=DEF")).toBe(false);
  });
});

describe("parseReferralCookie", () => {
  it("parses a `<code>.<epochMillis>` value into code + capturedAt", () => {
    const parsed = parseReferralCookie("ABCD2345.1700000000000");
    expect(parsed).toEqual({ code: "ABCD2345", capturedAt: new Date(1700000000000) });
  });

  it("returns null for undefined / empty", () => {
    expect(parseReferralCookie(undefined)).toBeNull();
    expect(parseReferralCookie("")).toBeNull();
  });

  it("returns null for a legacy timestamp-less value (no dot)", () => {
    expect(parseReferralCookie("ABCD2345")).toBeNull();
  });

  it("returns null when the code part is invalid/garbage", () => {
    expect(parseReferralCookie("../evil.1700000000000")).toBeNull();
    expect(parseReferralCookie(".1700000000000")).toBeNull();
  });

  it("returns null when the timestamp part is non-numeric or empty", () => {
    expect(parseReferralCookie("ABCD2345.notanumber")).toBeNull();
    expect(parseReferralCookie("ABCD2345.")).toBeNull();
    expect(parseReferralCookie("ABCD2345.-5")).toBeNull();
  });

  it("returns null for a zero timestamp (must be a positive epoch)", () => {
    expect(parseReferralCookie("ABCD2345.0")).toBeNull();
  });

  it("returns null for an out-of-safe-range timestamp (overflow guard)", () => {
    expect(parseReferralCookie("ABCD2345.99999999999999999999")).toBeNull();
  });

  it("tolerates extra dots only in the timestamp boundary (splits on the LAST dot)", () => {
    // Codes are alnum so they never contain a dot; a stray dot makes the code
    // part invalid → null (fail safe).
    expect(parseReferralCookie("AB.CD.1700000000000")).toBeNull();
  });
});

/**
 * Minimal fakes for the NextRequest/NextResponse cookie surfaces we use so the
 * capture logic can be unit-tested without the edge runtime.
 */
function fakeRequest(url: string) {
  return { nextUrl: new URL(url) } as unknown as Parameters<
    typeof captureReferralFromRequest
  >[0];
}

function fakeResponse() {
  const set = vi.fn();
  return {
    set,
    response: { cookies: { set } } as unknown as Parameters<
      typeof captureReferralFromRequest
    >[1],
  };
}

describe("captureReferralFromRequest", () => {
  let res: ReturnType<typeof fakeResponse>;
  beforeEach(() => {
    res = fakeResponse();
  });

  it("sets a short-lived httpOnly cookie encoding the code AND a capture timestamp", () => {
    const before = Date.now();
    const captured = captureReferralFromRequest(
      fakeRequest("https://app.test/?ref=ABCD2345"),
      res.response,
    );
    const after = Date.now();
    expect(captured).toBe(true);
    expect(res.set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = res.set.mock.calls[0]!;
    expect(name).toBe(REFERRAL_COOKIE);
    // Value is the `<code>.<epochMillis>` encoding — parse it back.
    const parsed = parseReferralCookie(value);
    expect(parsed?.code).toBe("ABCD2345");
    expect(parsed!.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(parsed!.capturedAt.getTime()).toBeLessThanOrEqual(after);
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    });
  });

  it("does nothing when there is no ?ref param", () => {
    const captured = captureReferralFromRequest(
      fakeRequest("https://app.test/"),
      res.response,
    );
    expect(captured).toBe(false);
    expect(res.set).not.toHaveBeenCalled();
  });

  it("ignores an invalid/garbage ?ref value (no cookie set)", () => {
    const captured = captureReferralFromRequest(
      fakeRequest("https://app.test/?ref=" + encodeURIComponent("../evil ")),
      res.response,
    );
    expect(captured).toBe(false);
    expect(res.set).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before validating/storing", () => {
    const captured = captureReferralFromRequest(
      fakeRequest("https://app.test/?ref=" + encodeURIComponent("  ABCD2345  ")),
      res.response,
    );
    expect(captured).toBe(true);
    expect(parseReferralCookie(res.set.mock.calls[0]![1])?.code).toBe("ABCD2345");
  });

  it("has a max-age of about 30 minutes", () => {
    expect(REFERRAL_COOKIE_MAX_AGE_SECONDS).toBe(30 * 60);
  });

  describe("Secure flag (derived from the app scheme, not NODE_ENV)", () => {
    const savedAuthUrl = process.env.AUTH_URL;
    const savedNextAuthUrl = process.env.NEXTAUTH_URL;
    const savedNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      restoreEnv("AUTH_URL", savedAuthUrl);
      restoreEnv("NEXTAUTH_URL", savedNextAuthUrl);
      Object.defineProperty(process.env, "NODE_ENV", {
        value: savedNodeEnv,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    });

    function restoreEnv(key: string, value: string | undefined) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    it("marks the cookie Secure when AUTH_URL is https (even over an http request)", () => {
      process.env.AUTH_URL = "https://www.project50.fit";
      delete process.env.NEXTAUTH_URL;
      captureReferralFromRequest(fakeRequest("http://internal/?ref=ABCD2345"), res.response);
      expect(res.set.mock.calls[0]![2]).toMatchObject({ secure: true });
    });

    it("falls back to NEXTAUTH_URL https when AUTH_URL is unset", () => {
      delete process.env.AUTH_URL;
      process.env.NEXTAUTH_URL = "https://www.project50.fit";
      captureReferralFromRequest(fakeRequest("http://internal/?ref=ABCD2345"), res.response);
      expect(res.set.mock.calls[0]![2]).toMatchObject({ secure: true });
    });

    it("does NOT mark the cookie Secure for an http deployment, but still SETS it", () => {
      delete process.env.AUTH_URL;
      delete process.env.NEXTAUTH_URL;
      // A production build (NODE_ENV=production) served over http must NOT be
      // Secure, or the browser never sends the cookie back over http.
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        configurable: true,
        writable: true,
        enumerable: true,
      });
      const captured = captureReferralFromRequest(
        fakeRequest("http://app.test/?ref=ABCD2345"),
        res.response,
      );
      expect(captured).toBe(true);
      expect(res.set.mock.calls[0]![2]).toMatchObject({ secure: false });
    });

    it("falls back to the incoming request scheme when no AUTH_URL is configured (https request → Secure)", () => {
      delete process.env.AUTH_URL;
      delete process.env.NEXTAUTH_URL;
      captureReferralFromRequest(fakeRequest("https://app.test/?ref=ABCD2345"), res.response);
      expect(res.set.mock.calls[0]![2]).toMatchObject({ secure: true });
    });
  });
});
