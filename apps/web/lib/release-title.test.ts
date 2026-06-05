import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveReleaseTitle, decodeReleaseTitleB64 } from "./release-title";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Base64 of a real release name with the spaces + parens that break az acr build. */
const RAW_TITLE = "fix(deploy): wire real release tag + notes link into the deployed badge (#300)";
const TITLE_B64 = Buffer.from(RAW_TITLE, "utf8").toString("base64");

describe("decodeReleaseTitleB64", () => {
  it("round-trips a title with spaces and parens", () => {
    expect(decodeReleaseTitleB64(TITLE_B64)).toBe(RAW_TITLE);
  });

  it("round-trips a short known value", () => {
    // echo -n 'fix(deploy): wire real release tag (#300)' | base64
    expect(decodeReleaseTitleB64("Zml4KGRlcGxveSk6IHdpcmUgcmVhbCByZWxlYXNlIHRhZyAoIzMwMCk=")).toBe(
      "fix(deploy): wire real release tag (#300)",
    );
  });

  it("returns empty string for undefined or empty input", () => {
    expect(decodeReleaseTitleB64(undefined)).toBe("");
    expect(decodeReleaseTitleB64("")).toBe("");
  });

  it("returns empty string (does not throw) if decoding blows up", () => {
    // Buffer.from(..., "base64") is lenient and won't normally throw; force the
    // failure path to prove the guard falls back cleanly rather than propagating.
    vi.spyOn(Buffer, "from").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(decodeReleaseTitleB64("anything")).toBe("");
  });
});

describe("resolveReleaseTitle", () => {
  it("decodes NEXT_PUBLIC_RELEASE_TITLE_B64 when present", () => {
    expect(resolveReleaseTitle({ NEXT_PUBLIC_RELEASE_TITLE_B64: TITLE_B64 })).toBe(RAW_TITLE);
  });

  it("prefers the decoded base64 over the legacy raw title", () => {
    expect(
      resolveReleaseTitle({
        NEXT_PUBLIC_RELEASE_TITLE_B64: TITLE_B64,
        NEXT_PUBLIC_RELEASE_TITLE: "Legacy raw title",
      }),
    ).toBe(RAW_TITLE);
  });

  it("falls back to the legacy raw title when no base64 is set", () => {
    expect(resolveReleaseTitle({ NEXT_PUBLIC_RELEASE_TITLE: "Legacy raw title" })).toBe(
      "Legacy raw title",
    );
  });

  it("falls back to the dev default when nothing is set", () => {
    expect(resolveReleaseTitle({})).toBe("Local development build");
  });

  it("falls back cleanly when the base64 decodes to an empty string", () => {
    expect(
      resolveReleaseTitle({ NEXT_PUBLIC_RELEASE_TITLE_B64: "", NEXT_PUBLIC_RELEASE_TITLE: "Raw" }),
    ).toBe("Raw");
  });
});
