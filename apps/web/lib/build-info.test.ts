import { describe, it, expect, afterEach, vi } from "vitest";
import { getBuildInfo, formatBuiltAt } from "./build-info";

const RELEASE_KEYS = [
  "NEXT_PUBLIC_RELEASE_TAG",
  "NEXT_PUBLIC_RELEASE_SHA",
  "NEXT_PUBLIC_RELEASE_TIME",
  "NEXT_PUBLIC_RELEASE_TITLE",
  "NEXT_PUBLIC_RELEASE_URL",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  for (const k of RELEASE_KEYS) delete process.env[k];
});

describe("getBuildInfo", () => {
  it("returns honest dev fallbacks when no release env is set", () => {
    for (const k of RELEASE_KEYS) delete process.env[k];
    expect(getBuildInfo()).toEqual({
      tag: "dev",
      sha: "local",
      builtAt: "",
      title: "Local development build",
      releaseUrl: "",
    });
  });

  it("reads injected release env vars", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TAG", "v2026.06.04.1");
    vi.stubEnv("NEXT_PUBLIC_RELEASE_SHA", "4c3f9ab");
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TIME", "2026-06-04T09:40:00.000Z");
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TITLE", "Day-complete next-step guidance");
    vi.stubEnv("NEXT_PUBLIC_RELEASE_URL", "https://github.com/tomqwu/project50/releases/tag/v2026.06.04.1");
    expect(getBuildInfo()).toEqual({
      tag: "v2026.06.04.1",
      sha: "4c3f9ab",
      builtAt: "2026-06-04T09:40:00.000Z",
      title: "Day-complete next-step guidance",
      releaseUrl: "https://github.com/tomqwu/project50/releases/tag/v2026.06.04.1",
    });
  });

  it("treats empty-string env vars as unset (falls back)", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TAG", "");
    expect(getBuildInfo().tag).toBe("dev");
  });
});

describe("formatBuiltAt", () => {
  it("formats an ISO timestamp as compact UTC", () => {
    expect(formatBuiltAt("2026-06-04T09:40:12.000Z")).toBe("2026-06-04 09:40 UTC");
  });

  it("returns empty string for empty input", () => {
    expect(formatBuiltAt("")).toBe("");
  });

  it("returns empty string for an unparseable timestamp", () => {
    expect(formatBuiltAt("not-a-date")).toBe("");
  });
});
