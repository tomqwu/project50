/**
 * crash.ts — env-gated crash & error reporting via Sentry React Native.
 *
 * One Expo integration covers both iOS (#96) and Android (#114): @sentry/react-native
 * reports native crashes and JS errors on both platforms from a single init.
 *
 * Gating: Sentry is initialized ONLY when EXPO_PUBLIC_SENTRY_DSN is set to a
 * non-empty value. Without a DSN this module is a complete no-op — Sentry.init is
 * never called — so local dev, CI, and Expo Go are entirely unaffected (no native
 * crash handlers installed, no network). babel-preset-expo inlines EXPO_PUBLIC_*
 * env at build time, so an unset DSN simply yields a disabled reporter.
 *
 * Usage: call initCrashReporting() once at startup, then forward caught errors
 * with captureError(err). Both are safe to call when disabled.
 */

import * as Sentry from "@sentry/react-native";

/** Whether Sentry.init ran (i.e. a DSN was configured). Drives captureError. */
let initialized = false;

/**
 * Initialize Sentry crash/error reporting when a DSN is configured.
 *
 * No-op (Sentry.init is never called) when EXPO_PUBLIC_SENTRY_DSN is unset or
 * empty, keeping dev/CI/Expo-Go free of native crash handlers. Idempotent: only
 * the first call with a DSN initializes.
 *
 * @param dsn — Sentry DSN. Defaults to EXPO_PUBLIC_SENTRY_DSN, which
 *   babel-preset-expo inlines at build time; the parameter exists to keep the
 *   value injectable (e.g. in tests), mirroring push.ts.
 */
export function initCrashReporting(
  dsn: string | undefined = process.env["EXPO_PUBLIC_SENTRY_DSN"],
): void {
  if (initialized) {
    return;
  }
  if (!dsn) {
    return;
  }
  Sentry.init({ dsn });
  initialized = true;
}

/**
 * Report a caught error to Sentry when reporting is initialized; otherwise a
 * no-op. Use for errors you handle but still want visibility into.
 */
export function captureError(err: unknown): void {
  if (!initialized) {
    return;
  }
  Sentry.captureException(err);
}
