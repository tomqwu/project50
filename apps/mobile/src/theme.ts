/**
 * Momentum palette — mobile platform constants.
 * These mirror the web design tokens but are standalone (separate platform).
 * Update both when changing the palette.
 */
export const colors = {
  /** Deep charcoal background */
  charcoal: "#121013",
  /** Volt accent — used for brand, CTAs, active states */
  volt: "#D6FF3F",
  /** Primary text */
  text: "#F2F0EC",
} as const;

export type Color = (typeof colors)[keyof typeof colors];
