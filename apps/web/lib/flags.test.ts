import { describe, expect, it } from "vitest";
import {
  FLAGS,
  type FlagName,
  type FeatureFlag,
  isFlagEnabled,
  isFeatureEnabled,
  assignVariant,
  getFlags,
  getClientFlags,
} from "./flags";

/** A controlled env that does not leak into process.env. */
function env(vars: Record<string, string>): NodeJS.ProcessEnv {
  return vars as NodeJS.ProcessEnv;
}

describe("isFlagEnabled", () => {
  it("returns the registry default when no env override is present", () => {
    for (const name of Object.keys(FLAGS) as FlagName[]) {
      expect(isFlagEnabled(name, env({}))).toBe(FLAGS[name].default);
    }
  });

  it("env override FLAG_<NAME>=true enables a default-off flag", () => {
    expect(FLAGS.newOnboarding.default).toBe(false);
    expect(isFlagEnabled("newOnboarding", env({ FLAG_NEW_ONBOARDING: "true" }))).toBe(true);
  });

  it("env override FLAG_<NAME>=false disables a flag", () => {
    expect(isFlagEnabled("newOnboarding", env({ FLAG_NEW_ONBOARDING: "false" }))).toBe(false);
  });

  it("treats override values case-insensitively and trims whitespace", () => {
    expect(isFlagEnabled("newOnboarding", env({ FLAG_NEW_ONBOARDING: "  TRUE  " }))).toBe(true);
    expect(isFlagEnabled("newOnboarding", env({ FLAG_NEW_ONBOARDING: "False" }))).toBe(false);
  });

  it("accepts 1/0 as truthy/falsy override values", () => {
    expect(isFlagEnabled("newOnboarding", env({ FLAG_NEW_ONBOARDING: "1" }))).toBe(true);
    expect(isFlagEnabled("newOnboarding", env({ FLAG_NEW_ONBOARDING: "0" }))).toBe(false);
  });

  it("ignores an unrecognized override value and falls back to the default", () => {
    expect(isFlagEnabled("newOnboarding", env({ FLAG_NEW_ONBOARDING: "maybe" }))).toBe(
      FLAGS.newOnboarding.default,
    );
  });

  it("reads from process.env when no env argument is given", () => {
    expect(isFlagEnabled("newOnboarding")).toBe(FLAGS.newOnboarding.default);
  });
});

describe("shareInstagram flag", () => {
  it("defaults ON (stable, already-shipped behaviour)", () => {
    expect(FLAGS.shareInstagram.default).toBe(true);
    expect(isFlagEnabled("shareInstagram", env({}))).toBe(true);
    expect(isFeatureEnabled("shareInstagram", env({}))).toBe(true);
  });

  it("is server-only (not client-safe)", () => {
    expect(FLAGS.shareInstagram.clientSafe).toBe(false);
  });

  it("is disabled ONLY by the explicit FLAG_SHARE_INSTAGRAM=false override", () => {
    expect(isFeatureEnabled("shareInstagram", env({ FLAG_SHARE_INSTAGRAM: "false" }))).toBe(false);
  });

  it("stays ON when absent from NEXT_PUBLIC_FLAGS (allow-list cannot disable it)", () => {
    // The allow-list only forces flags ON; omitting a default-ON flag does not
    // turn it off — it falls back to default: true. This is the documented
    // kill-switch contract (#285): use FLAG_SHARE_INSTAGRAM=false, not the list.
    expect(isFeatureEnabled("shareInstagram", env({ NEXT_PUBLIC_FLAGS: "publicBanner" }))).toBe(
      true,
    );
    expect(isFeatureEnabled("shareInstagram", env({ NEXT_PUBLIC_FLAGS: "" }))).toBe(true);
  });
});

describe("isFeatureEnabled", () => {
  const flag: FeatureFlag = "shareInstagram";

  it("returns the registry default with an empty env", () => {
    expect(isFeatureEnabled(flag, env({}))).toBe(FLAGS[flag].default);
    expect(isFeatureEnabled("newOnboarding", env({}))).toBe(FLAGS.newOnboarding.default);
  });

  it("honours a per-flag FLAG_<NAME> override (ON)", () => {
    expect(isFeatureEnabled("newOnboarding", env({ FLAG_NEW_ONBOARDING: "true" }))).toBe(true);
  });

  it("honours a per-flag FLAG_<NAME> override (OFF) as a kill-switch", () => {
    expect(isFeatureEnabled(flag, env({ FLAG_SHARE_INSTAGRAM: "false" }))).toBe(false);
  });

  it("enables a default-off flag listed in NEXT_PUBLIC_FLAGS", () => {
    expect(isFeatureEnabled("newOnboarding", env({ NEXT_PUBLIC_FLAGS: "newOnboarding" }))).toBe(
      true,
    );
  });

  it("matches NEXT_PUBLIC_FLAGS entries case-insensitively and trims whitespace", () => {
    expect(
      isFeatureEnabled("newOnboarding", env({ NEXT_PUBLIC_FLAGS: "  NEWONBOARDING , other " })),
    ).toBe(true);
  });

  it("leaves a flag at its default when not present in NEXT_PUBLIC_FLAGS", () => {
    expect(
      isFeatureEnabled("newOnboarding", env({ NEXT_PUBLIC_FLAGS: "publicBanner" })),
    ).toBe(false);
  });

  it("ignores unknown tokens in NEXT_PUBLIC_FLAGS", () => {
    expect(
      isFeatureEnabled("newOnboarding", env({ NEXT_PUBLIC_FLAGS: "nope,doesNotExist" })),
    ).toBe(FLAGS.newOnboarding.default);
  });

  it("treats a blank NEXT_PUBLIC_FLAGS as unset", () => {
    expect(isFeatureEnabled("newOnboarding", env({ NEXT_PUBLIC_FLAGS: "   " }))).toBe(
      FLAGS.newOnboarding.default,
    );
  });

  it("lets a FLAG_<NAME>=false override win over NEXT_PUBLIC_FLAGS membership", () => {
    // Most-specific wins: explicit OFF beats the allow-list.
    expect(
      isFeatureEnabled("newOnboarding", env({
        NEXT_PUBLIC_FLAGS: "newOnboarding",
        FLAG_NEW_ONBOARDING: "false",
      })),
    ).toBe(false);
  });

  it("reads from process.env when no env argument is given", () => {
    expect(isFeatureEnabled("shareInstagram")).toBe(FLAGS.shareInstagram.default);
  });
});

describe("assignVariant", () => {
  const variants = ["A", "B"] as const;

  it("is deterministic: same user + experiment always maps to the same variant", () => {
    const first = assignVariant("exp", "user-123", variants);
    for (let i = 0; i < 25; i++) {
      expect(assignVariant("exp", "user-123", variants)).toBe(first);
    }
  });

  it("returns a variant that is a member of the provided list", () => {
    const v = assignVariant("exp", "user-xyz", variants);
    expect(variants).toContain(v);
  });

  it("changes assignment when the experiment key changes (independent experiments)", () => {
    // The same user can land in different buckets across different experiments.
    const assignments = new Set<string>();
    for (let i = 0; i < 50; i++) {
      assignments.add(assignVariant(`exp-${i}`, "stable-user", variants));
    }
    expect(assignments.size).toBe(2);
  });

  it("distributes a population roughly evenly across variants", () => {
    const counts: Record<string, number> = { A: 0, B: 0 };
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const v = assignVariant("rollout", `user-${i}`, variants);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    // Each bucket should hold ~50%; allow a generous tolerance for hash noise.
    expect(counts.A).toBeGreaterThan(N * 0.4);
    expect(counts.B).toBeGreaterThan(N * 0.4);
  });

  it("supports more than two variants and uses all of them", () => {
    const three = ["control", "blue", "green"] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      seen.add(assignVariant("multi", `u${i}`, three));
    }
    expect(seen.size).toBe(3);
  });

  it("throws when given an empty variant list", () => {
    expect(() => assignVariant("exp", "user", [])).toThrow(/at least one variant/i);
  });
});

describe("getFlags", () => {
  it("resolves every registered flag to its default with an empty env", () => {
    const flags = getFlags(env({}));
    for (const name of Object.keys(FLAGS) as FlagName[]) {
      expect(flags[name]).toBe(FLAGS[name].default);
    }
  });

  it("applies env overrides", () => {
    const flags = getFlags(env({ FLAG_NEW_ONBOARDING: "true" }));
    expect(flags.newOnboarding).toBe(true);
  });

  it("reads from process.env when no env argument is given", () => {
    const flags = getFlags();
    expect(flags.newOnboarding).toBe(FLAGS.newOnboarding.default);
  });
});

describe("getClientFlags", () => {
  it("returns only client-safe flags", () => {
    const client = getClientFlags(env({}));
    const clientSafeNames = (Object.keys(FLAGS) as FlagName[]).filter(
      (n) => FLAGS[n].clientSafe,
    );
    expect(Object.keys(client).sort()).toEqual([...clientSafeNames].sort());
  });

  it("omits server-only flags", () => {
    const client = getClientFlags(env({}));
    const serverOnly = (Object.keys(FLAGS) as FlagName[]).find((n) => !FLAGS[n].clientSafe);
    if (serverOnly) {
      expect(serverOnly in client).toBe(false);
    }
  });

  it("reflects env overrides for client-safe flags", () => {
    const client = getClientFlags(env({ FLAG_PUBLIC_BANNER: "true" }));
    expect(client.publicBanner).toBe(true);
  });

  it("reads from process.env when no env argument is given", () => {
    const client = getClientFlags();
    expect(client.publicBanner).toBe(FLAGS.publicBanner.default);
  });
});
