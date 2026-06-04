/**
 * Tests for iap.ts — config-gated RevenueCat in-app purchases.
 *
 * The native `react-native-purchases` module can't run under jest, so we mock it
 * to a stub default export (the import only needs to resolve — our code calls an
 * INJECTED Purchases dep, never the real module). `react-native`'s Platform is
 * mocked so we can drive the iOS/Android key resolution.
 *
 * The whole point of this module is the key gating, so we exercise both the
 * configured and unconfigured paths for every function, plus purchase
 * success/cancel/failure, restore, offerings, and entitlement status. The
 * RevenueCat key + env are passed explicitly (babel-preset-expo inlines
 * EXPO_PUBLIC_* reads, so they can't be driven via process.env in tests — same
 * reason push.ts/crash.ts take injectable params); the default-arg path that
 * reads process.env is covered separately.
 */

// react-native-purchases is native; stub the default export so the import resolves.
jest.mock("react-native-purchases", () => ({ __esModule: true, default: {} }));

// Platform is read in resolveRevenueCatKey; default ios, overridden per test.
const platformState = { OS: "ios" };
jest.mock("react-native", () => ({
  Platform: {
    get OS(): string {
      return platformState.OS;
    },
  },
}));

import type {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
} from "react-native-purchases";
import {
  resolveRevenueCatKey,
  isIapConfigured,
  initIap,
  getOfferings,
  purchasePremium,
  restorePurchases,
  getEntitlementStatus,
  resetIapForTests,
  IapNotConfiguredError,
  PREMIUM_ENTITLEMENT_ID,
} from "./iap";
import type { PurchasesDeps } from "./iap";

// ─── Test fixtures ──────────────────────────────────────────────────────────

const KEY = "rcat_public_key";
const IOS_ENV = { EXPO_PUBLIC_REVENUECAT_IOS_KEY: KEY };
const ANDROID_ENV = { EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: KEY };
const SHARED_ENV = { EXPO_PUBLIC_REVENUECAT_KEY: KEY };
const EMPTY_ENV: Record<string, string | undefined> = {};

function makeCustomerInfo(active: boolean): CustomerInfo {
  return {
    entitlements: {
      active: active ? { [PREMIUM_ENTITLEMENT_ID]: {} } : {},
      all: {},
    },
  } as unknown as CustomerInfo;
}

const fakePackage = { identifier: "$rc_monthly" } as unknown as PurchasesPackage;
const fakeOffering = {
  identifier: "default",
  availablePackages: [fakePackage],
} as unknown as PurchasesOffering;

/** A fully-mocked PurchasesDeps with overridable methods. */
function makeDeps(overrides: Partial<PurchasesDeps> = {}): jest.Mocked<PurchasesDeps> {
  return {
    configure: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    getCustomerInfo: jest.fn(),
    ...overrides,
  } as jest.Mocked<PurchasesDeps>;
}

beforeEach(() => {
  jest.clearAllMocks();
  platformState.OS = "ios";
  resetIapForTests();
});

// ─── resolveRevenueCatKey ─────────────────────────────────────────────────────

describe("resolveRevenueCatKey", () => {
  it("uses the iOS platform key on iOS", () => {
    platformState.OS = "ios";
    expect(resolveRevenueCatKey(IOS_ENV)).toBe(KEY);
  });

  it("uses the Android platform key on Android", () => {
    platformState.OS = "android";
    expect(resolveRevenueCatKey(ANDROID_ENV)).toBe(KEY);
  });

  it("does NOT use the Android key when running on iOS", () => {
    platformState.OS = "ios";
    expect(resolveRevenueCatKey(ANDROID_ENV)).toBeUndefined();
  });

  it("falls back to the shared key when no platform key is set", () => {
    expect(resolveRevenueCatKey(SHARED_ENV)).toBe(KEY);
  });

  it("prefers the platform key over the shared key", () => {
    platformState.OS = "ios";
    expect(
      resolveRevenueCatKey({
        EXPO_PUBLIC_REVENUECAT_IOS_KEY: "ios-key",
        EXPO_PUBLIC_REVENUECAT_KEY: "shared-key",
      }),
    ).toBe("ios-key");
  });

  it("returns undefined when no key is set", () => {
    expect(resolveRevenueCatKey(EMPTY_ENV)).toBeUndefined();
  });

  it("treats an empty-string key as unset", () => {
    expect(resolveRevenueCatKey({ EXPO_PUBLIC_REVENUECAT_KEY: "" })).toBeUndefined();
  });

  it("reads process.env by default", () => {
    // Under jest the inlined EXPO_PUBLIC_* env is unset → undefined.
    expect(resolveRevenueCatKey()).toBeUndefined();
  });
});

// ─── isIapConfigured ──────────────────────────────────────────────────────────

describe("isIapConfigured", () => {
  it("is true when a key is configured", () => {
    expect(isIapConfigured(SHARED_ENV)).toBe(true);
  });

  it("is false when no key is configured", () => {
    expect(isIapConfigured(EMPTY_ENV)).toBe(false);
  });

  it("reads process.env by default (unset under jest → false)", () => {
    expect(isIapConfigured()).toBe(false);
  });
});

// ─── initIap ──────────────────────────────────────────────────────────────────

describe("initIap", () => {
  it("configures Purchases with the resolved key when configured", () => {
    const deps = makeDeps();
    const ok = initIap(deps, SHARED_ENV);
    expect(ok).toBe(true);
    expect(deps.configure).toHaveBeenCalledTimes(1);
    expect(deps.configure).toHaveBeenCalledWith({ apiKey: KEY });
  });

  it("is a no-op and returns false when unconfigured", () => {
    const deps = makeDeps();
    const ok = initIap(deps, EMPTY_ENV);
    expect(ok).toBe(false);
    expect(deps.configure).not.toHaveBeenCalled();
  });

  it("only configures once even if called repeatedly", () => {
    const deps = makeDeps();
    initIap(deps, SHARED_ENV);
    const second = initIap(deps, SHARED_ENV);
    expect(second).toBe(true);
    expect(deps.configure).toHaveBeenCalledTimes(1);
  });

  it("uses the default Purchases dep when none is injected (no-op unconfigured)", () => {
    // Default deps path with the env unset under jest → returns false, no throw.
    expect(initIap()).toBe(false);
  });
});

// ─── getOfferings ─────────────────────────────────────────────────────────────

describe("getOfferings", () => {
  it("returns the current offering when configured", async () => {
    const deps = makeDeps({
      getOfferings: jest.fn().mockResolvedValue({ current: fakeOffering }),
    });
    const offering = await getOfferings(deps, SHARED_ENV);
    expect(offering).toBe(fakeOffering);
  });

  it("returns null when there is no current offering", async () => {
    const deps = makeDeps({
      getOfferings: jest.fn().mockResolvedValue({ current: null }),
    });
    expect(await getOfferings(deps, SHARED_ENV)).toBeNull();
  });

  it("returns null (no fetch) when unconfigured", async () => {
    const deps = makeDeps();
    expect(await getOfferings(deps, EMPTY_ENV)).toBeNull();
    expect(deps.getOfferings).not.toHaveBeenCalled();
  });

  it("uses default deps + process.env (unconfigured → null)", async () => {
    expect(await getOfferings()).toBeNull();
  });
});

// ─── purchasePremium ──────────────────────────────────────────────────────────

describe("purchasePremium", () => {
  it("returns true when the purchase activates premium", async () => {
    const deps = makeDeps({
      purchasePackage: jest
        .fn()
        .mockResolvedValue({ customerInfo: makeCustomerInfo(true) }),
    });
    const result = await purchasePremium(fakePackage, deps, SHARED_ENV);
    expect(result).toBe(true);
    expect(deps.purchasePackage).toHaveBeenCalledWith(fakePackage);
  });

  it("returns false when the purchase succeeds but premium is not active", async () => {
    const deps = makeDeps({
      purchasePackage: jest
        .fn()
        .mockResolvedValue({ customerInfo: makeCustomerInfo(false) }),
    });
    expect(await purchasePremium(fakePackage, deps, SHARED_ENV)).toBe(false);
  });

  it("returns null when the user cancels (userCancelled: true)", async () => {
    const deps = makeDeps({
      purchasePackage: jest.fn().mockRejectedValue({ userCancelled: true }),
    });
    expect(await purchasePremium(fakePackage, deps, SHARED_ENV)).toBeNull();
  });

  it("rethrows a real store error (userCancelled falsy)", async () => {
    const err = new Error("store down");
    const deps = makeDeps({
      purchasePackage: jest.fn().mockRejectedValue(err),
    });
    await expect(purchasePremium(fakePackage, deps, SHARED_ENV)).rejects.toThrow(
      "store down",
    );
  });

  it("rethrows when the rejection is not an object", async () => {
    const deps = makeDeps({
      purchasePackage: jest.fn().mockRejectedValue("nope"),
    });
    await expect(
      purchasePremium(fakePackage, deps, SHARED_ENV),
    ).rejects.toBe("nope");
  });

  it("throws IapNotConfiguredError when unconfigured", async () => {
    const deps = makeDeps();
    await expect(
      purchasePremium(fakePackage, deps, EMPTY_ENV),
    ).rejects.toBeInstanceOf(IapNotConfiguredError);
    expect(deps.purchasePackage).not.toHaveBeenCalled();
  });

  it("uses default deps + process.env (unconfigured → throws)", async () => {
    await expect(purchasePremium(fakePackage)).rejects.toBeInstanceOf(
      IapNotConfiguredError,
    );
  });
});

// ─── restorePurchases ─────────────────────────────────────────────────────────

describe("restorePurchases", () => {
  it("returns true when restore yields an active premium entitlement", async () => {
    const deps = makeDeps({
      restorePurchases: jest.fn().mockResolvedValue(makeCustomerInfo(true)),
    });
    expect(await restorePurchases(deps, SHARED_ENV)).toBe(true);
  });

  it("returns false when restore yields no active premium entitlement", async () => {
    const deps = makeDeps({
      restorePurchases: jest.fn().mockResolvedValue(makeCustomerInfo(false)),
    });
    expect(await restorePurchases(deps, SHARED_ENV)).toBe(false);
  });

  it("throws IapNotConfiguredError when unconfigured", async () => {
    const deps = makeDeps();
    await expect(restorePurchases(deps, EMPTY_ENV)).rejects.toBeInstanceOf(
      IapNotConfiguredError,
    );
    expect(deps.restorePurchases).not.toHaveBeenCalled();
  });

  it("uses default deps + process.env (unconfigured → throws)", async () => {
    await expect(restorePurchases()).rejects.toBeInstanceOf(
      IapNotConfiguredError,
    );
  });
});

// ─── getEntitlementStatus ─────────────────────────────────────────────────────

describe("getEntitlementStatus", () => {
  it("returns true when premium is active", async () => {
    const deps = makeDeps({
      getCustomerInfo: jest.fn().mockResolvedValue(makeCustomerInfo(true)),
    });
    expect(await getEntitlementStatus(deps, SHARED_ENV)).toBe(true);
  });

  it("returns false when premium is not active", async () => {
    const deps = makeDeps({
      getCustomerInfo: jest.fn().mockResolvedValue(makeCustomerInfo(false)),
    });
    expect(await getEntitlementStatus(deps, SHARED_ENV)).toBe(false);
  });

  it("returns null (no fetch) when unconfigured", async () => {
    const deps = makeDeps();
    expect(await getEntitlementStatus(deps, EMPTY_ENV)).toBeNull();
    expect(deps.getCustomerInfo).not.toHaveBeenCalled();
  });

  it("uses default deps + process.env (unconfigured → null)", async () => {
    expect(await getEntitlementStatus()).toBeNull();
  });
});

// ─── IapNotConfiguredError ────────────────────────────────────────────────────

describe("IapNotConfiguredError", () => {
  it("has a clear name and message", () => {
    const err = new IapNotConfiguredError();
    expect(err.name).toBe("IapNotConfiguredError");
    expect(err.message).toMatch(/not configured/i);
  });
});
