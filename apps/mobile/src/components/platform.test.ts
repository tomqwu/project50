/**
 * Tests for the cross-platform UI helpers.
 *
 * jest-expo binds `Platform.select` to the preset OS at load time, so mutating
 * `Platform.OS` does not change `select`'s result. We instead mock react-native
 * with a mutable OS getter + a real `select` implementation (mirroring the
 * approach in push.test.ts / iap.test.ts), then flip `platformState.OS`.
 */

const platformState = { OS: "ios" as "ios" | "android" | "web" };

jest.mock("react-native", () => ({
  Platform: {
    get OS(): string {
      return platformState.OS;
    },
    select(spec: Record<string, unknown>): unknown {
      if (platformState.OS in spec) {
        return spec[platformState.OS];
      }
      return spec.default;
    },
  },
}));

import {
  elevation,
  ripple,
  rippleBorderless,
  uiFontFamily,
  MIN_TOUCH_TARGET,
  accent,
} from "./platform";

describe("platform helpers", () => {
  afterEach(() => {
    platformState.OS = "ios";
  });

  describe("elevation", () => {
    it("returns iOS shadow primitives on iOS", () => {
      platformState.OS = "ios";
      const style = elevation(3);
      expect(style).toMatchObject({
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 6,
      });
      expect(style.elevation).toBeUndefined();
    });

    it("returns Material elevation on Android", () => {
      platformState.OS = "android";
      expect(elevation(4)).toEqual({ elevation: 4 });
    });

    it("defaults the level to 2", () => {
      platformState.OS = "ios";
      expect(elevation().shadowOffset).toEqual({ width: 0, height: 2 });
    });

    it("returns an empty object on other platforms", () => {
      platformState.OS = "web";
      expect(elevation(2)).toEqual({});
    });
  });

  describe("ripple", () => {
    it("returns a ripple config on Android with the default colour", () => {
      platformState.OS = "android";
      expect(ripple()).toEqual({ color: "rgba(214, 255, 63, 0.24)", borderless: false });
    });

    it("honours a custom colour on Android", () => {
      platformState.OS = "android";
      expect(ripple("#fff")).toEqual({ color: "#fff", borderless: false });
    });

    it("returns undefined on iOS", () => {
      platformState.OS = "ios";
      expect(ripple()).toBeUndefined();
    });
  });

  describe("rippleBorderless", () => {
    it("returns a borderless ripple on Android", () => {
      platformState.OS = "android";
      expect(rippleBorderless()).toEqual({
        color: "rgba(214, 255, 63, 0.28)",
        borderless: true,
      });
    });

    it("honours a custom colour on Android", () => {
      platformState.OS = "android";
      expect(rippleBorderless("#abc")).toEqual({ color: "#abc", borderless: true });
    });

    it("returns undefined on iOS", () => {
      platformState.OS = "ios";
      expect(rippleBorderless()).toBeUndefined();
    });
  });

  describe("uiFontFamily", () => {
    it("returns System on iOS", () => {
      platformState.OS = "ios";
      expect(uiFontFamily()).toBe("System");
    });

    it("returns Roboto on Android", () => {
      platformState.OS = "android";
      expect(uiFontFamily()).toBe("Roboto");
    });

    it("returns undefined on other platforms", () => {
      platformState.OS = "web";
      expect(uiFontFamily()).toBeUndefined();
    });
  });

  it("exports the touch-target minimum and accent colour", () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
    expect(accent).toBe("#D6FF3F");
  });
});
