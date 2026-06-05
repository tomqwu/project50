import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveReleaseTitle,
  decodeReleaseTitleB64,
  encodeReleaseTitleB64,
  RELEASE_TITLE_B64_SENTINEL,
} from "./release-title";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A real release name with the spaces + parens that break az acr build. */
const RAW_TITLE = "fix(deploy): wire real release tag + notes link into the deployed badge (#300)";
/** The build-arg the deploy pipeline emits: base64 of SENTINEL + title. */
const TITLE_B64 = encodeReleaseTitleB64(RAW_TITLE);

describe("encodeReleaseTitleB64 / decodeReleaseTitleB64 round-trip", () => {
  it("round-trips a title with spaces and parens", () => {
    expect(decodeReleaseTitleB64(TITLE_B64)).toBe(RAW_TITLE);
  });

  it("emits a shell-safe single base64 token (no spaces/parens)", () => {
    expect(TITLE_B64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it("round-trips a multibyte (accented) title", () => {
    const t = "café — naïve coöp (#42)";
    expect(decodeReleaseTitleB64(encodeReleaseTitleB64(t))).toBe(t);
  });

  it("round-trips a title with allowed whitespace controls (tab/newline)", () => {
    const t = "line one\nline\ttwo";
    expect(decodeReleaseTitleB64(encodeReleaseTitleB64(t))).toBe(t);
  });

  it("embeds the sentinel so the encoded payload is distinguishable", () => {
    const decodedRaw = Buffer.from(TITLE_B64, "base64").toString("utf8");
    expect(decodedRaw.startsWith(RELEASE_TITLE_B64_SENTINEL)).toBe(true);
    expect(decodedRaw.slice(RELEASE_TITLE_B64_SENTINEL.length)).toBe(RAW_TITLE);
  });
});

describe("decodeReleaseTitleB64", () => {
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

  it("rejects the RAW title accidentally passed as the B64 arg", () => {
    // Operator footgun: the un-encoded title shoved into NEXT_PUBLIC_RELEASE_TITLE_B64.
    // Spaces/parens/`:`/`#` aren't base64 charset, so it fails validation entirely.
    expect(decodeReleaseTitleB64(RAW_TITLE)).toBe("");
    expect(decodeReleaseTitleB64("fix(deploy): wire real release tag (#300)")).toBe("");
  });

  it("rejects a raw word that happens to be canonical base64 (no sentinel)", () => {
    // The subtle case Codex flagged: short raw titles that ARE valid base64.
    // "TWFu"->"Man", "YWJj"->"abc", "RC01"->"D-5". Without the sentinel prefix
    // these must NOT be accepted as decoded titles — they fall back instead.
    expect(decodeReleaseTitleB64("TWFu")).toBe("");
    expect(decodeReleaseTitleB64("YWJj")).toBe("");
    expect(decodeReleaseTitleB64("RC01")).toBe("");
    // A correctly-encoded "abc" (with the sentinel) DOES decode.
    expect(decodeReleaseTitleB64(encodeReleaseTitleB64("abc"))).toBe("abc");
  });

  it("rejects random / truncated non-base64 input", () => {
    expect(decodeReleaseTitleB64("not base64 at all!!!")).toBe("");
    expect(decodeReleaseTitleB64("@@@@")).toBe("");
    // Right charset but length not a multiple of 4 → reject.
    expect(decodeReleaseTitleB64("abcde")).toBe("");
    // Lenient decoder would accept this (drops the stray char); round-trip rejects it.
    expect(decodeReleaseTitleB64("YWJj=")).toBe("");
    // Charset-valid and length%4===0, but non-canonical: "Zm9=" decodes to "fo"
    // which re-encodes to "Zm8=" — fails the round-trip check.
    expect(decodeReleaseTitleB64("Zm9=")).toBe("");
  });

  it("rejects valid base64 whose decoded payload lacks the sentinel", () => {
    // Canonical base64 of a plausible-looking but un-sentineled string.
    expect(decodeReleaseTitleB64(Buffer.from("Release 1.0", "utf8").toString("base64"))).toBe("");
  });

  it("rejects an empty title after the sentinel", () => {
    // Sentinel present but no actual title — nothing to show, fall back.
    expect(decodeReleaseTitleB64(encodeReleaseTitleB64(""))).toBe("");
  });

  it("rejects a sentineled payload whose title carries a disallowed control char", () => {
    // Encode SENTINEL + "ab\x07cd" (BEL) directly; the title portion is invalid.
    const b64 = Buffer.from(`${RELEASE_TITLE_B64_SENTINEL}ab\x07cd`, "utf8").toString("base64");
    expect(decodeReleaseTitleB64(b64)).toBe("");
  });

  it("rejects a sentineled payload whose title carries a U+FFFD replacement char", () => {
    const b64 = Buffer.from(`${RELEASE_TITLE_B64_SENTINEL}ab�cd`, "utf8").toString("base64");
    expect(decodeReleaseTitleB64(b64)).toBe("");
  });

  it("rejects valid-base64 bytes that aren't valid UTF-8", () => {
    // base64 of [0xff,0xfe,0x41]: utf8 decode yields replacement chars and fails round-trip.
    expect(decodeReleaseTitleB64("//5B")).toBe("");
  });
});

describe("resolveReleaseTitle", () => {
  it("decodes a correctly-encoded NEXT_PUBLIC_RELEASE_TITLE_B64", () => {
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

  it("falls back cleanly when the base64 is empty", () => {
    expect(
      resolveReleaseTitle({ NEXT_PUBLIC_RELEASE_TITLE_B64: "", NEXT_PUBLIC_RELEASE_TITLE: "Raw" }),
    ).toBe("Raw");
  });

  it("falls back to the legacy raw title when B64 holds a malformed (raw) value", () => {
    // The classic footgun: the RAW title pasted into the B64 arg. Must NOT inline
    // garbage — fall through to the legacy raw title.
    expect(
      resolveReleaseTitle({
        NEXT_PUBLIC_RELEASE_TITLE_B64: "fix(deploy): wire real release tag (#300)",
        NEXT_PUBLIC_RELEASE_TITLE: "Legacy raw title",
      }),
    ).toBe("Legacy raw title");
  });

  it("falls back when B64 is a sentinel-less valid-base64 word (Codex case)", () => {
    expect(
      resolveReleaseTitle({ NEXT_PUBLIC_RELEASE_TITLE_B64: "TWFu", NEXT_PUBLIC_RELEASE_TITLE: "Raw" }),
    ).toBe("Raw");
  });

  it("falls back to the dev default when B64 is malformed and no legacy title is set", () => {
    expect(resolveReleaseTitle({ NEXT_PUBLIC_RELEASE_TITLE_B64: "not base64 at all!!!" })).toBe(
      "Local development build",
    );
  });
});
