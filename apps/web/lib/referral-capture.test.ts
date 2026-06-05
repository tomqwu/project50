import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  isValidReferralCode,
  captureReferralFromRequest,
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

  it("sets a short-lived httpOnly cookie when ?ref=<valid code> is present", () => {
    const captured = captureReferralFromRequest(
      fakeRequest("https://app.test/?ref=ABCD2345"),
      res.response,
    );
    expect(captured).toBe(true);
    expect(res.set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = res.set.mock.calls[0]!;
    expect(name).toBe(REFERRAL_COOKIE);
    expect(value).toBe("ABCD2345");
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
    expect(res.set.mock.calls[0]![1]).toBe("ABCD2345");
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
