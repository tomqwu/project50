import { describe, it, expect } from "vitest";
import { dayShareUrl, facebookSharerUrl, referralUrl } from "./share-links";

describe("dayShareUrl", () => {
  it("builds the public per-day URL from origin, shareId, and day number", () => {
    expect(dayShareUrl("https://www.project50.fit", "abc123", 7)).toBe(
      "https://www.project50.fit/c/abc123/day/7",
    );
  });

  it("does not duplicate or drop the slash when origin has no trailing slash", () => {
    expect(dayShareUrl("https://example.com", "s", 1)).toBe("https://example.com/c/s/day/1");
  });

  it("preserves a custom origin path/port verbatim", () => {
    expect(dayShareUrl("http://localhost:3000", "share-xyz", 50)).toBe(
      "http://localhost:3000/c/share-xyz/day/50",
    );
  });
});

describe("facebookSharerUrl", () => {
  it("wraps a URL in the Facebook sharer endpoint with the url query-encoded", () => {
    expect(facebookSharerUrl("https://www.project50.fit/c/abc/day/7")).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=" +
        encodeURIComponent("https://www.project50.fit/c/abc/day/7"),
    );
  });

  it("percent-encodes reserved characters in the target URL", () => {
    const url = "https://x.test/c/a b/day/1?q=1&r=2";
    expect(facebookSharerUrl(url)).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    );
  });
});

describe("referralUrl", () => {
  it("builds the referral link from origin and code (matches the /?ref= convention)", () => {
    expect(referralUrl("https://www.project50.fit", "ABCD2345")).toBe(
      "https://www.project50.fit/?ref=ABCD2345",
    );
  });

  it("does not duplicate or drop the slash when origin has no trailing slash", () => {
    expect(referralUrl("https://app.test", "XYZ")).toBe("https://app.test/?ref=XYZ");
  });

  it("preserves a custom origin path/port verbatim", () => {
    expect(referralUrl("http://localhost:3000", "code-1")).toBe(
      "http://localhost:3000/?ref=code-1",
    );
  });
});
