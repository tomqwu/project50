/**
 * Cross-platform UI helpers — small, theme-aware utilities that encode the
 * iOS-vs-Android conventions the screens share. Centralised so every screen
 * applies the same native polish (shadow vs elevation, press ripple).
 *
 * Keep this dependency-light: it is pure style/data, no components.
 */

import { Platform } from "react-native";
import type { ViewStyle } from "react-native";
import { colors } from "../theme";

/**
 * Elevation/shadow for a raised surface (cards, primary buttons).
 *
 * iOS uses the soft layered shadow conventions; Android uses Material
 * `elevation`. `Platform.select` keeps each platform idiomatic from one call.
 *
 * @param level Material-ish elevation level (1 = subtle, 4 = prominent).
 */
export function elevation(level = 2): ViewStyle {
  // `default: {}` guarantees a defined ViewStyle on every platform, so the
  // return type narrows without a non-null fallback.
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: level },
      shadowOpacity: 0.18,
      shadowRadius: level * 2,
    },
    android: { elevation: level },
    // Web/test fallback: no native shadow primitives.
    default: {},
  });
}

/**
 * Android ripple config for `Pressable android_ripple`. On iOS this returns
 * `undefined` (iOS uses opacity/highlight feedback instead of ripple), letting
 * callers spread it unconditionally: `<Pressable android_ripple={ripple()} />`.
 *
 * @param color Ripple colour; defaults to a translucent volt accent.
 */
export function ripple(
  color: string = "rgba(214, 255, 63, 0.24)",
): { color: string; borderless?: boolean } | undefined {
  return Platform.select({
    android: { color, borderless: false },
    default: undefined,
  });
}

/**
 * Borderless ripple for icon-sized / circular targets (e.g. emoji chips).
 */
export function rippleBorderless(
  color: string = "rgba(214, 255, 63, 0.28)",
): { color: string; borderless: boolean } | undefined {
  return Platform.select({
    android: { color, borderless: true },
    default: undefined,
  });
}

/**
 * Platform-appropriate UI font family for headings/brand. iOS gets the system
 * San Francisco face; Android gets Roboto. Returns `undefined` elsewhere so the
 * platform default applies.
 */
export function uiFontFamily(): string | undefined {
  return Platform.select({
    ios: "System",
    android: "Roboto",
    default: undefined,
  });
}

/** Minimum touch target per Apple HIG / Material guidelines. */
export const MIN_TOUCH_TARGET = 44;

/** Volt accent re-export to keep ripple defaults in sync with the theme. */
export const accent = colors.volt;
