/**
 * Unit tests for useAttribution — the fire-once startup attribution hook.
 *
 * The capture fn is injected so we never touch the native bridge. We assert it
 * runs once on mount, is not re-run across re-renders, and that a rejecting
 * capture is swallowed (never throws into the React tree).
 */

// useAttribution → attribution.ts pulls in AsyncStorage + expo-linking at import
// time; mock both so the module graph resolves under Jest (the default-arg test
// calls the real, gated, no-op-safe captureAttribution).
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));
jest.mock("expo-linking", () => ({
  parse: () => ({ queryParams: {} }),
  getInitialURL: jest.fn(async () => null),
}));

import { renderHook } from "@testing-library/react-native";

import { useAttribution } from "./useAttribution";

describe("useAttribution", () => {
  it("invokes capture exactly once on mount", () => {
    const capture = jest.fn().mockResolvedValue(null);

    renderHook(() => useAttribution(capture));

    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("does not re-run capture across re-renders", () => {
    const capture = jest.fn().mockResolvedValue(null);

    const { rerender } = renderHook(() => useAttribution(capture));
    rerender({});
    rerender({});

    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejecting capture without throwing", async () => {
    const capture = jest.fn().mockRejectedValue(new Error("boom"));

    expect(() => renderHook(() => useAttribution(capture))).not.toThrow();
    // Let the rejected promise settle so an unhandled rejection would surface.
    await Promise.resolve();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("defaults to the real captureAttribution when no arg is passed", () => {
    // Exercises the default-parameter path. captureAttribution is gated/no-op
    // safe, so calling it under test is harmless (it resolves to null).
    expect(() => renderHook(() => useAttribution())).not.toThrow();
  });
});
