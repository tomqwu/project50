/**
 * Tests for share.ts.
 * Mocks expo-sharing and Linking. The native shareAsync/openURL call is excluded
 * (istanbul ignore next) — the surrounding logic (checking sharing capability) is tested.
 * See COVERAGE.md.
 */

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

// Mock only the Linking module from react-native to avoid pulling in the full native stack.
const mockOpenURL = jest.fn();
jest.mock("react-native/Libraries/Linking/Linking", () => ({
  openURL: mockOpenURL,
}));

import * as Sharing from "expo-sharing";
import { shareUrl } from "./share";

const mockIsAvailable = Sharing.isAvailableAsync as jest.Mock;
const mockShareAsync = Sharing.shareAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("shareUrl", () => {
  it("calls Sharing.shareAsync when sharing is available", async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockShareAsync.mockResolvedValueOnce(undefined);

    await shareUrl("https://example.com/share");

    expect(mockIsAvailable).toHaveBeenCalledTimes(1);
    expect(mockShareAsync).toHaveBeenCalledWith("https://example.com/share");
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it("falls back to Linking.openURL when sharing is not available", async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    mockOpenURL.mockResolvedValueOnce(undefined);

    await shareUrl("https://example.com/share");

    expect(mockIsAvailable).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).toHaveBeenCalledWith("https://example.com/share");
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it("propagates errors from Sharing.shareAsync", async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockShareAsync.mockRejectedValueOnce(new Error("Share failed"));

    await expect(shareUrl("https://example.com/share")).rejects.toThrow("Share failed");
  });

  it("propagates errors from Linking.openURL", async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    mockOpenURL.mockRejectedValueOnce(new Error("Open failed"));

    await expect(shareUrl("https://example.com/share")).rejects.toThrow("Open failed");
  });
});
