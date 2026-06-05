import { describe, it, expect, vi, beforeEach } from "vitest";
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
});
