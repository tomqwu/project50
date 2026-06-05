/**
 * push.ts — Expo push notification registration for daily reminders.
 *
 * Single Expo feature (`expo-notifications`) covering both iOS APNs (#91) and
 * Android FCM (#109): Expo's push service abstracts the platform transport, so
 * one Expo push token drives reminders on both. We:
 *   1. registerForPushNotifications() — request permission (permission-gated, no
 *      crash on denial → returns null) and fetch the Expo push token.
 *   2. savePushToken() — POST the token + platform to the backend so the server
 *      can deliver scheduled daily reminders.
 *
 * Daily-reminder delivery itself is server-side (the backend already owns
 * reminder scheduling / quiet hours); this module's job is to obtain and
 * register the token the server pushes to.
 *
 * Expo Go limits (documented): in Expo Go on SDK 53+ remote push is unavailable,
 * and on a simulator/emulator `Device.isDevice` is false — both cases return
 * null gracefully so startup never crashes. A development/production build (EAS)
 * is required for real device tokens.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { apiClient } from "./apiClient";
import { resolveApiBaseUrl } from "./config";

/** Android notification channel id for Project 50 daily reminders. */
export const PROJECT50_REMINDER_CHANNEL = "project50-reminders";

/** The platform string we report to the backend for token routing. */
export type PushPlatform = "ios" | "android";

function currentPlatform(): PushPlatform {
  return Platform.OS === "android" ? "android" : "ios";
}

/**
 * Register the device for push notifications and return the Expo push token.
 *
 * Returns null (never throws) when:
 *   - running on a non-physical device (simulator/emulator/Expo Go web),
 *   - the user denies notification permission,
 *   - the token fetch fails (e.g. offline, Expo Go limits).
 *
 * Call this after sign-in; pass the returned token to {@link savePushToken}.
 *
 * @param projectId — EAS projectId for getExpoPushTokenAsync (required in
 *   standalone builds). Defaults to EXPO_PUBLIC_EAS_PROJECT_ID. babel-preset-expo
 *   inlines that env at build time, so the parameter exists to keep the value
 *   injectable (e.g. in tests).
 */
export async function registerForPushNotifications(
  projectId: string | undefined = process.env["EXPO_PUBLIC_EAS_PROJECT_ID"],
): Promise<string | null> {
  // Remote push only works on real hardware. Bail out cleanly on simulators
  // and Expo Go web so startup never crashes.
  if (!Device.isDevice) {
    return null;
  }

  // Android requires a notification channel to be declared before tokens are
  // requested; iOS has no equivalent.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(PROJECT50_REMINDER_CHANNEL, {
      name: "Daily reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Request permission only if not already granted (avoids re-prompting).
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    return null;
  }

  // EAS projectId is required for getExpoPushTokenAsync in standalone builds;
  // when set we pass it through, otherwise let expo-notifications infer it.
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenResponse.data;
  } catch {
    // Token fetch can fail offline or under Expo Go limits — degrade quietly.
    return null;
  }
}

/**
 * POST the Expo push token + platform to the backend so it can deliver daily
 * reminders. Authenticated with the current session bearer token (call after
 * sign-in). Throws on a non-OK response so callers can log/retry.
 */
export async function savePushToken(
  token: string,
  baseUrl?: string,
): Promise<void> {
  const base = baseUrl ?? resolveApiBaseUrl();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = apiClient.getToken();
  if (auth) {
    headers["Authorization"] = `Bearer ${auth}`;
  }

  const resp = await fetch(`${base}/api/push/register`, {
    method: "POST",
    headers,
    body: JSON.stringify({ token, platform: currentPlatform() }),
  });

  if (!resp.ok) {
    throw new Error(`Push token registration failed: ${resp.status}`);
  }
}

/**
 * Convenience: register for push and, if a token is obtained, save it to the
 * backend. Returns the token (or null when unavailable). Never throws on the
 * permission path; a save failure is swallowed so it can't break startup.
 */
export async function registerAndSavePushToken(
  baseUrl?: string,
): Promise<string | null> {
  const token = await registerForPushNotifications();
  if (!token) {
    return null;
  }
  try {
    await savePushToken(token, baseUrl);
  } catch {
    // Registration is best-effort at startup; a failed save must not crash the app.
  }
  return token;
}
