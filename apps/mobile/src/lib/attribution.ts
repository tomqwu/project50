/**
 * attribution.ts — install / acquisition attribution capture for the project50
 * mobile app.
 *
 * On first launch we resolve where the install came from and persist it once
 * (first-write-wins) so later analytics can attribute the user to a campaign:
 *
 *   (a) the initial deep link / install URL via expo-linking
 *       (`Linking.getInitialURL()`), parsed for the standard UTM params
 *       (`utm_source`/`utm_medium`/`utm_campaign`/`utm_content`/`utm_term`) plus
 *       any `ref` referrer param, and
 *   (b) the Android Play Store install referrer, *if* a resolver is provided.
 *       No heavyweight native install-referrer SDK ships with the app, so this
 *       source is fully optional/injectable — absent a resolver it is skipped,
 *       and on iOS / Expo Go it simply contributes nothing.
 *
 * Gating (mirrors crash.ts / push.ts): controlled by EXPO_PUBLIC_ATTRIBUTION_ENABLED.
 * Default-on, but a complete no-op when explicitly set to "false" — capture does
 * nothing and getAttribution() returns null — and always no-op-safe (missing URL,
 * unparseable URL, and storage errors are swallowed) so dev/CI/Expo Go are
 * unaffected. babel-preset-expo inlines EXPO_PUBLIC_* at build time; the gate and
 * every dependency are injectable so the logic is unit-testable.
 *
 * Usage: call captureAttribution() once at startup (see useAttribution()).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";

/** Stable AsyncStorage key the captured payload is persisted under (once). */
export const ATTRIBUTION_STORAGE_KEY = "p50.attribution.v1";

/** The slice of AsyncStorage we depend on — injectable for tests. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** Captured install/acquisition attribution payload. */
export interface AttributionData {
  /** utm_source (e.g. `facebook`, `newsletter`). */
  source: string | null;
  /** utm_medium (e.g. `cpc`, `email`). */
  medium: string | null;
  /** utm_campaign (e.g. `launch_50`). */
  campaign: string | null;
  /** utm_content (e.g. `hero_cta`). */
  content: string | null;
  /** utm_term (paid-keyword term). */
  term: string | null;
  /** Free-form `ref` referrer param from the deep link. */
  referrer: string | null;
  /** Raw Android Play Store install referrer string, if resolved. */
  installReferrer: string | null;
  /** Epoch ms the attribution was first captured. */
  capturedAt: number;
}

/** Minimal analytics sink — called once with the captured attribution. */
export type AnalyticsForwarder = (event: string, data: AttributionData) => void;

/** The analytics event name used when forwarding captured attribution. */
export const ATTRIBUTION_EVENT = "install_attribution";

/** Injectable dependencies for captureAttribution (all default to real impls). */
export interface CaptureAttributionDeps {
  /** Resolves the cold-start / install URL. Defaults to Linking.getInitialURL. */
  getInitialURL?: () => Promise<string | null>;
  /**
   * Resolves the Android Play install referrer string, if available. Optional:
   * no native install-referrer SDK is bundled, so when omitted this source is
   * skipped (iOS / Expo Go always omit it).
   */
  getInstallReferrer?: () => Promise<string | null>;
  /** AsyncStorage-shaped store. Defaults to AsyncStorage. */
  store?: KeyValueStore;
  /** Optional analytics sink the captured payload is forwarded to. */
  analytics?: AnalyticsForwarder;
  /** Clock, injectable for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Gate value. Defaults to EXPO_PUBLIC_ATTRIBUTION_ENABLED. */
  enabledFlag?: string | undefined;
}

/** Normalise a possibly-array query param to a single trimmed string (or null). */
function firstValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Whether attribution capture is enabled. Default-on; disabled only when the
 * gate is the explicit string "false". Mirrors the EXPO_PUBLIC_* gating used by
 * crash.ts/push.ts; the value is injectable because babel-preset-expo inlines
 * EXPO_PUBLIC_* reads at build time (so they can't be driven via process.env in
 * tests).
 */
export function isAttributionEnabled(
  enabledFlag: string | undefined = process.env["EXPO_PUBLIC_ATTRIBUTION_ENABLED"],
): boolean {
  return enabledFlag !== "false";
}

/**
 * Parse UTM + ref params out of a deep-link / install URL into a partial
 * attribution payload. Returns all-null for an empty or unparseable URL — never
 * throws.
 */
export function parseAttributionUrl(url: string | null | undefined): {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrer: string | null;
} {
  const empty = {
    source: null,
    medium: null,
    campaign: null,
    content: null,
    term: null,
    referrer: null,
  };
  if (!url) return empty;

  let query: Record<string, string | string[] | undefined> = {};
  try {
    query = (Linking.parse(url).queryParams ?? {}) as typeof query;
  } catch {
    // Malformed URL — treat as no attribution rather than crashing startup.
    return empty;
  }

  return {
    source: firstValue(query["utm_source"]),
    medium: firstValue(query["utm_medium"]),
    campaign: firstValue(query["utm_campaign"]),
    content: firstValue(query["utm_content"]),
    term: firstValue(query["utm_term"]),
    referrer: firstValue(query["ref"]),
  };
}

/** Return the stored attribution payload, or null when none / unparseable / error. */
export async function getAttribution(
  store: KeyValueStore = AsyncStorage,
): Promise<AttributionData | null> {
  let raw: string | null;
  try {
    raw = await store.getItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as AttributionData;
  } catch {
    return null;
  }
}

/**
 * Capture install/acquisition attribution on first launch.
 *
 * No-op when disabled. Otherwise: if a payload was already stored, returns it
 * unchanged (first-write-wins — never overwrites). On a genuine first launch it
 * resolves the install URL (UTM/ref) and the optional Android install referrer,
 * persists the merged payload once, forwards it to analytics (if provided), and
 * returns it. All failures (missing/invalid URL, storage errors, referrer
 * resolution errors) are swallowed and yield null so startup is never blocked.
 */
export async function captureAttribution(
  deps: CaptureAttributionDeps = {},
): Promise<AttributionData | null> {
  const enabledFlag =
    deps.enabledFlag !== undefined
      ? deps.enabledFlag
      : process.env["EXPO_PUBLIC_ATTRIBUTION_ENABLED"];
  if (!isAttributionEnabled(enabledFlag)) {
    return null;
  }

  const store = deps.store ?? AsyncStorage;
  const getInitialURL = deps.getInitialURL ?? Linking.getInitialURL;
  const now = deps.now ?? Date.now;

  // First-write-wins: never overwrite a previously captured payload.
  const existing = await getAttribution(store);
  if (existing !== null) {
    return existing;
  }

  let url: string | null = null;
  try {
    url = await getInitialURL();
  } catch {
    url = null;
  }

  let installReferrer: string | null = null;
  if (deps.getInstallReferrer) {
    try {
      installReferrer = await deps.getInstallReferrer();
    } catch {
      installReferrer = null;
    }
  }

  const parsed = parseAttributionUrl(url);
  const data: AttributionData = {
    ...parsed,
    installReferrer: firstValue(installReferrer ?? undefined),
    capturedAt: now(),
  };

  try {
    await store.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Persistence failed — don't forward a payload we couldn't store, and don't
    // crash. A later launch will retry.
    return null;
  }

  if (deps.analytics) {
    try {
      deps.analytics(ATTRIBUTION_EVENT, data);
    } catch {
      // A misbehaving analytics sink must not break capture.
    }
  }

  return data;
}
