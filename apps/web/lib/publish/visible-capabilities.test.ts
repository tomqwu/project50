import { describe, expect, it } from "vitest";
import type { Capability, Platform } from "./types";
import { visibleCapabilities } from "./visible-capabilities";

/** A controlled env that does not leak into process.env. */
function env(vars: Record<string, string>): NodeJS.ProcessEnv {
  return vars as NodeJS.ProcessEnv;
}

function cap(platform: Platform): Capability {
  return { platform, method: "DEEPLINK", apiAvailable: false };
}

const all: Capability[] = [
  cap("WEBSHARE"),
  cap("FACEBOOK"),
  cap("INSTAGRAM"),
  cap("WECHAT"),
];

describe("visibleCapabilities", () => {
  it("keeps Instagram when the flag defaults ON (no env override)", () => {
    const out = visibleCapabilities(all, env({}));
    expect(out.map((c) => c.platform)).toContain("INSTAGRAM");
    expect(out).toHaveLength(all.length);
  });

  it("keeps Instagram when shareInstagram is listed in NEXT_PUBLIC_FLAGS", () => {
    const out = visibleCapabilities(all, env({ NEXT_PUBLIC_FLAGS: "shareInstagram" }));
    expect(out.map((c) => c.platform)).toContain("INSTAGRAM");
  });

  it("drops Instagram when FLAG_SHARE_INSTAGRAM=false (kill-switch)", () => {
    const out = visibleCapabilities(all, env({ FLAG_SHARE_INSTAGRAM: "false" }));
    expect(out.map((c) => c.platform)).toEqual(["WEBSHARE", "FACEBOOK", "WECHAT"]);
  });

  it("leaves the other platforms untouched when Instagram is killed", () => {
    const out = visibleCapabilities(all, env({ FLAG_SHARE_INSTAGRAM: "0" }));
    expect(out.map((c) => c.platform)).not.toContain("INSTAGRAM");
    expect(out.map((c) => c.platform)).toEqual(
      expect.arrayContaining(["WEBSHARE", "FACEBOOK", "WECHAT"]),
    );
  });

  it("returns an empty list unchanged", () => {
    expect(visibleCapabilities([], env({ FLAG_SHARE_INSTAGRAM: "false" }))).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...all];
    visibleCapabilities(input, env({ FLAG_SHARE_INSTAGRAM: "false" }));
    expect(input).toEqual(all);
  });
});
