/**
 * iap.ts — config-gated in-app purchases (subscriptions) via RevenueCat.
 *
 * One cross-platform library (`react-native-purchases`) wraps StoreKit on iOS
 * (#93) and Play Billing on Android (#111): a single RevenueCat configuration +
 * `purchasePackage` drives subscriptions on both stores.
 *
 * Gating: the IAP layer is active ONLY when a RevenueCat public API key is
 * configured. We read the platform-specific key first
 * (EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY) and fall
 * back to EXPO_PUBLIC_REVENUECAT_KEY. When no key is set every function is a
 * graceful no-op / clear-throw:
 *   - isIapConfigured() → false
 *   - initIap() → no-op (Purchases.configure never called)
 *   - getOfferings() / getEntitlementStatus() → null (unavailable)
 *   - purchasePremium() / restorePurchases() → throw a clear "not configured"
 *     error so the UI can show an explicit message rather than silently failing.
 * This keeps local dev, CI, and Expo Go entirely unaffected (no native StoreKit/
 * Play Billing handlers installed, no network). babel-preset-expo inlines
 * EXPO_PUBLIC_* env at build time, so an unset key simply disables IAP.
 *
 * The native `react-native-purchases` module cannot run under jest, so the
 * Purchases dependency is injectable (mirroring the env-injection in push.ts /
 * crash.ts): every function takes an optional `deps` arg, defaulting to the real
 * module surface. Tests pass a mock and never touch the native module.
 *
 * Usage:
 *   initIap();                       // once at startup (safe when unconfigured)
 *   const offering = await getOfferings();
 *   await purchasePremium(pkg);      // from the Upgrade screen
 *   await restorePurchases();        // "Restore" button
 *   const active = await getEntitlementStatus();
 */

import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import type {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
} from "react-native-purchases";

/**
 * The entitlement identifier configured in the RevenueCat dashboard that grants
 * premium access. A user is "premium" when this entitlement is active.
 */
export const PREMIUM_ENTITLEMENT_ID = "premium";

/**
 * The subset of the `react-native-purchases` default export our code calls.
 * Declaring it explicitly keeps the dependency injectable for tests and
 * documents exactly which native methods we depend on.
 */
export interface PurchasesDeps {
  configure(opts: { apiKey: string }): void;
  getOfferings(): Promise<{ current: PurchasesOffering | null }>;
  purchasePackage(
    pkg: PurchasesPackage,
  ): Promise<{ customerInfo: CustomerInfo }>;
  restorePurchases(): Promise<CustomerInfo>;
  getCustomerInfo(): Promise<CustomerInfo>;
}

/** The real native module, narrowed to {@link PurchasesDeps}. */
const defaultPurchases: PurchasesDeps =
  Purchases as unknown as PurchasesDeps;

/**
 * Resolve the RevenueCat API key for the current platform.
 *
 * Order: platform-specific key (EXPO_PUBLIC_REVENUECAT_IOS_KEY on iOS,
 * EXPO_PUBLIC_REVENUECAT_ANDROID_KEY on Android) → shared
 * EXPO_PUBLIC_REVENUECAT_KEY. Returns undefined (IAP disabled) when none is set.
 *
 * @param env — env source. Defaults to process.env; babel-preset-expo inlines
 *   EXPO_PUBLIC_* reads, so the parameter exists to keep the value injectable in
 *   tests (mirroring push.ts / crash.ts).
 */
export function resolveRevenueCatKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const platformKey =
    Platform.OS === "android"
      ? env["EXPO_PUBLIC_REVENUECAT_ANDROID_KEY"]
      : env["EXPO_PUBLIC_REVENUECAT_IOS_KEY"];
  const key = platformKey || env["EXPO_PUBLIC_REVENUECAT_KEY"];
  return key ? key : undefined;
}

/**
 * Whether IAP is configured (a RevenueCat key is present). Drives the
 * "available" vs "unavailable" UI state and the no-op behavior below.
 */
export function isIapConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveRevenueCatKey(env) !== undefined;
}

/** Module-level guard so initIap() configures Purchases at most once. */
let initialized = false;

/**
 * Configure RevenueCat when a key is present; otherwise a no-op.
 *
 * Safe to call at startup and when unconfigured (Purchases.configure is never
 * called without a key, so dev/CI/Expo Go install no native handlers).
 * Idempotent: only the first call with a key configures.
 *
 * @returns true if Purchases was configured (now or previously), false if IAP
 *   is unconfigured.
 */
export function initIap(
  deps: PurchasesDeps = defaultPurchases,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (initialized) {
    return true;
  }
  const apiKey = resolveRevenueCatKey(env);
  if (!apiKey) {
    return false;
  }
  deps.configure({ apiKey });
  initialized = true;
  return true;
}

/** Test-only: reset the module-level init guard between cases. */
export function resetIapForTests(): void {
  initialized = false;
}

/**
 * Fetch the current premium offering, or null when IAP is unconfigured / there
 * is no current offering. Never throws for the unconfigured case — the UI shows
 * an "unavailable" state instead.
 */
export async function getOfferings(
  deps: PurchasesDeps = defaultPurchases,
  env: Record<string, string | undefined> = process.env,
): Promise<PurchasesOffering | null> {
  if (!isIapConfigured(env)) {
    return null;
  }
  const offerings = await deps.getOfferings();
  return offerings.current;
}

/**
 * Error thrown by purchase/restore when IAP is not configured, so the UI can
 * distinguish "unavailable" from a real store failure.
 */
export class IapNotConfiguredError extends Error {
  constructor() {
    super("In-app purchases are not configured (no RevenueCat key).");
    this.name = "IapNotConfiguredError";
  }
}

/**
 * Purchase the given premium subscription package.
 *
 * Throws {@link IapNotConfiguredError} when IAP is unconfigured. On a user
 * cancellation the underlying SDK rejects with an error carrying
 * `userCancelled: true`; we surface that as a normalized result rather than a
 * throw so the UI can treat cancel as a benign no-op.
 *
 * @returns the entitlement-active status after the purchase (true when the
 *   premium entitlement is now active), or `null` when the user cancelled.
 */
export async function purchasePremium(
  pkg: PurchasesPackage,
  deps: PurchasesDeps = defaultPurchases,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean | null> {
  if (!isIapConfigured(env)) {
    throw new IapNotConfiguredError();
  }
  try {
    const { customerInfo } = await deps.purchasePackage(pkg);
    return hasPremium(customerInfo);
  } catch (err) {
    if (isUserCancelled(err)) {
      return null;
    }
    throw err;
  }
}

/**
 * Restore previously-purchased subscriptions for the current store account.
 *
 * Throws {@link IapNotConfiguredError} when IAP is unconfigured.
 *
 * @returns true when the premium entitlement is active after restore.
 */
export async function restorePurchases(
  deps: PurchasesDeps = defaultPurchases,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (!isIapConfigured(env)) {
    throw new IapNotConfiguredError();
  }
  const customerInfo = await deps.restorePurchases();
  return hasPremium(customerInfo);
}

/**
 * Current premium entitlement status, or null when IAP is unconfigured.
 * Use to gate premium features at startup / on the Upgrade screen.
 */
export async function getEntitlementStatus(
  deps: PurchasesDeps = defaultPurchases,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean | null> {
  if (!isIapConfigured(env)) {
    return null;
  }
  const customerInfo = await deps.getCustomerInfo();
  return hasPremium(customerInfo);
}

/** Whether the premium entitlement is active in the given CustomerInfo. */
function hasPremium(customerInfo: CustomerInfo): boolean {
  return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;
}

/** Whether a thrown SDK error represents a user-initiated cancellation. */
function isUserCancelled(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "userCancelled" in err &&
    (err as { userCancelled?: unknown }).userCancelled === true
  );
}
