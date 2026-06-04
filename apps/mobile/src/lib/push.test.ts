/**
 * Unit tests for push.ts.
 *
 * Mocks: expo-notifications, expo-device, react-native Platform, global.fetch,
 *        apiClient (for the auth token).
 *
 * The native side of expo-notifications (the actual push delivery) cannot run
 * under jest; we mock the module surface our code touches and assert on the
 * permission/registration branching, which is where all of our logic lives.
 */

import type { PushPlatform } from "./push";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

// expo-device's `isDevice` is a static boolean. Babel compiles `import * as`
// into read-only namespace getters, so we cannot reassign `Device.isDevice`
// directly in tests — back it with a mutable holder and a getter instead.
const deviceState = { isDevice: true };
jest.mock("expo-device", () => ({
  get isDevice(): boolean {
    return deviceState.isDevice;
  },
}));

jest.mock("./apiClient", () => ({
  apiClient: { getToken: jest.fn(() => "test-token") },
}));

// Platform is read at call time; default to ios, overridden per-test.
const platformState = { OS: "ios" };
jest.mock("react-native", () => ({
  Platform: {
    get OS(): string {
      return platformState.OS;
    },
  },
}));

import * as Notifications from "expo-notifications";
import { apiClient } from "./apiClient";
import {
  registerForPushNotifications,
  savePushToken,
  registerAndSavePushToken,
  PROJECT50_REMINDER_CHANNEL,
} from "./push";

const mockGetPerms = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPerms = Notifications.requestPermissionsAsync as jest.Mock;
const mockGetToken = Notifications.getExpoPushTokenAsync as jest.Mock;
const mockSetChannel = Notifications.setNotificationChannelAsync as jest.Mock;
const mockApiGetToken = apiClient.getToken as jest.Mock;
const globalFetch = (): jest.Mock => global.fetch as jest.Mock;

beforeEach(() => {
  global.fetch = jest.fn() as typeof fetch;
  jest.clearAllMocks();
  // reset platform + device defaults
  platformState.OS = "ios";
  deviceState.isDevice = true;
  mockApiGetToken.mockReturnValue("test-token");
});

// ─── registerForPushNotifications ──────────────────────────────────────────────

describe("registerForPushNotifications", () => {
  it("returns the Expo push token when permission is already granted", async () => {
    mockGetPerms.mockResolvedValueOnce({ status: "granted" });
    mockGetToken.mockResolvedValueOnce({ data: "ExponentPushToken[abc]" });

    const token = await registerForPushNotifications();

    expect(token).toBe("ExponentPushToken[abc]");
    expect(mockRequestPerms).not.toHaveBeenCalled();
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it("requests permission when not yet granted, then returns the token", async () => {
    mockGetPerms.mockResolvedValueOnce({ status: "undetermined" });
    mockRequestPerms.mockResolvedValueOnce({ status: "granted" });
    mockGetToken.mockResolvedValueOnce({ data: "ExponentPushToken[xyz]" });

    const token = await registerForPushNotifications();

    expect(token).toBe("ExponentPushToken[xyz]");
    expect(mockRequestPerms).toHaveBeenCalledTimes(1);
  });

  it("returns null (gracefully) when permission is denied", async () => {
    mockGetPerms.mockResolvedValueOnce({ status: "denied" });
    mockRequestPerms.mockResolvedValueOnce({ status: "denied" });

    const token = await registerForPushNotifications();

    expect(token).toBeNull();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("returns null when running on a non-physical device (simulator/Expo Go web)", async () => {
    deviceState.isDevice = false;

    const token = await registerForPushNotifications();

    expect(token).toBeNull();
    expect(mockGetPerms).not.toHaveBeenCalled();
  });

  it("configures the Android notification channel before fetching the token", async () => {
    platformState.OS = "android";
    mockGetPerms.mockResolvedValueOnce({ status: "granted" });
    mockSetChannel.mockResolvedValueOnce(undefined);
    mockGetToken.mockResolvedValueOnce({ data: "ExponentPushToken[and]" });

    const token = await registerForPushNotifications();

    expect(token).toBe("ExponentPushToken[and]");
    expect(mockSetChannel).toHaveBeenCalledWith(
      PROJECT50_REMINDER_CHANNEL,
      expect.objectContaining({ name: expect.any(String) }),
    );
  });

  it("does NOT configure a channel on iOS", async () => {
    platformState.OS = "ios";
    mockGetPerms.mockResolvedValueOnce({ status: "granted" });
    mockGetToken.mockResolvedValueOnce({ data: "ExponentPushToken[ios]" });

    await registerForPushNotifications();

    expect(mockSetChannel).not.toHaveBeenCalled();
  });

  it("passes the EAS projectId to getExpoPushTokenAsync when provided", async () => {
    mockGetPerms.mockResolvedValueOnce({ status: "granted" });
    mockGetToken.mockResolvedValueOnce({ data: "ExponentPushToken[p]" });

    await registerForPushNotifications("proj-123");

    expect(mockGetToken).toHaveBeenCalledWith({ projectId: "proj-123" });
  });

  it("calls getExpoPushTokenAsync with no args when no projectId is set", async () => {
    mockGetPerms.mockResolvedValueOnce({ status: "granted" });
    mockGetToken.mockResolvedValueOnce({ data: "ExponentPushToken[n]" });

    await registerForPushNotifications(undefined);

    expect(mockGetToken).toHaveBeenCalledWith(undefined);
  });

  it("returns null when getExpoPushTokenAsync throws (no crash)", async () => {
    mockGetPerms.mockResolvedValueOnce({ status: "granted" });
    mockGetToken.mockRejectedValueOnce(new Error("no network"));

    const token = await registerForPushNotifications();

    expect(token).toBeNull();
  });
});

// ─── savePushToken ─────────────────────────────────────────────────────────────

describe("savePushToken", () => {
  function mockFetchOk(): void {
    globalFetch().mockResolvedValueOnce({ ok: true, status: 200 });
  }

  it("POSTs the token + platform to the backend with the auth header", async () => {
    mockFetchOk();

    await savePushToken("ExponentPushToken[abc]", "http://localhost:3000");

    const calls = globalFetch().mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]![0]).toBe("http://localhost:3000/api/push/register");
    const init = calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-token",
    );
    const body = JSON.parse(init.body as string) as {
      token: string;
      platform: PushPlatform;
    };
    expect(body).toEqual({ token: "ExponentPushToken[abc]", platform: "ios" });
  });

  it("sends platform 'android' when running on Android", async () => {
    platformState.OS = "android";
    mockFetchOk();

    await savePushToken("ExponentPushToken[a]", "http://localhost:3000");

    const calls = globalFetch().mock.calls as Array<[string, RequestInit]>;
    const body = JSON.parse(calls[0]![1]!.body as string) as { platform: PushPlatform };
    expect(body.platform).toBe("android");
  });

  it("omits the Authorization header when there is no session token", async () => {
    mockApiGetToken.mockReturnValueOnce(null);
    mockFetchOk();

    await savePushToken("ExponentPushToken[x]", "http://localhost:3000");

    const calls = globalFetch().mock.calls as Array<[string, RequestInit]>;
    const headers = calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("uses the default base URL when none is provided and no env var is set", async () => {
    delete process.env["EXPO_PUBLIC_API_BASE_URL"];
    mockFetchOk();

    await savePushToken("ExponentPushToken[d]");

    const calls = globalFetch().mock.calls as Array<[string, unknown]>;
    expect(calls[0]![0]).toBe("http://localhost:3000/api/push/register");
  });

  it("throws when the backend responds with a non-OK status", async () => {
    globalFetch().mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(
      savePushToken("ExponentPushToken[e]", "http://localhost:3000"),
    ).rejects.toThrow("Push token registration failed: 500");
  });
});

// ─── registerAndSavePushToken ──────────────────────────────────────────────────

describe("registerAndSavePushToken", () => {
  it("registers then saves the token, returning it", async () => {
    mockGetPerms.mockResolvedValueOnce({ status: "granted" });
    mockGetToken.mockResolvedValueOnce({ data: "ExponentPushToken[full]" });
    globalFetch().mockResolvedValueOnce({ ok: true, status: 200 });

    const token = await registerAndSavePushToken("http://localhost:3000");

    expect(token).toBe("ExponentPushToken[full]");
    expect(globalFetch()).toHaveBeenCalledTimes(1);
  });

  it("returns null and does not POST when no token is obtained (denied)", async () => {
    mockGetPerms.mockResolvedValueOnce({ status: "denied" });
    mockRequestPerms.mockResolvedValueOnce({ status: "denied" });

    const token = await registerAndSavePushToken("http://localhost:3000");

    expect(token).toBeNull();
    expect(globalFetch()).not.toHaveBeenCalled();
  });

  it("still returns the token when the backend save fails (best-effort)", async () => {
    mockGetPerms.mockResolvedValueOnce({ status: "granted" });
    mockGetToken.mockResolvedValueOnce({ data: "ExponentPushToken[best]" });
    globalFetch().mockResolvedValueOnce({ ok: false, status: 503 });

    const token = await registerAndSavePushToken("http://localhost:3000");

    expect(token).toBe("ExponentPushToken[best]");
  });
});
