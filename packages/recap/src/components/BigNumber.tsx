import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens.js";

export interface BigNumberProps {
  /** Target numeric value the counter will animate toward. */
  value: number;
  /** Number of frames the count-up takes (default 60). */
  animationFrames?: number;
  /** Optional unit label shown after the number (e.g. "days", "km"). */
  unit?: string;
  /** Font size for the numeral in px (default 140). */
  fontSize?: number;
}

/**
 * Anton numeral that counts up from 0 to `value` over `animationFrames` frames.
 * Uses Remotion's `interpolate` with clamp extrapolation so frame 0 always
 * shows 0 and any frame >= animationFrames always shows the full value.
 */
export function BigNumber({
  value,
  animationFrames = 60,
  unit,
  fontSize = 140,
}: BigNumberProps) {
  const frame = useCurrentFrame();

  const current = Math.round(
    interpolate(frame, [0, animationFrames], [0, value], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontFamily: fonts.display,
          fontSize,
          lineHeight: 0.9,
          color: colors.volt,
          textTransform: "uppercase" as const,
        }}
        data-testid="big-number-value"
      >
        {current}
      </span>
      {unit && (
        <span
          style={{
            fontFamily: fonts.body,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase" as const,
            color: colors.muted,
            marginTop: 8,
          }}
          data-testid="big-number-unit"
        >
          {unit}
        </span>
      )}
    </div>
  );
}
