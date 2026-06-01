import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens.js";

export interface RingFillProps {
  /** Current value being shown (e.g. daysCompleted). */
  value: number;
  /** Maximum value (the full ring at 100%). */
  max: number;
  /** Number of frames for the fill animation (default 90). */
  animationFrames?: number;
  /** Size of the SVG in px (default 240). */
  size?: number;
  /** Stroke width in px (default 18). */
  strokeWidth?: number;
  /** Optional label shown in the centre of the ring. */
  label?: string;
}

/**
 * SVG progress ring whose stroke-dashoffset animates from empty to value/max
 * over animationFrames. The ring is Momentum-volt with a glow filter.
 */
export function RingFill({
  value,
  max,
  animationFrames = 90,
  size = 240,
  strokeWidth = 18,
  label,
}: RingFillProps) {
  const frame = useCurrentFrame();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetFraction = max > 0 ? Math.min(value / max, 1) : 0;

  const animatedFraction = interpolate(
    frame,
    [0, animationFrames],
    [0, targetFraction],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const dashLength = circumference * animatedFraction;
  const gap = circumference - dashLength;

  return (
    <div
      style={{ position: "relative", width: size, height: size }}
      data-testid="ring-fill-container"
    >
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
        data-testid="ring-fill-svg"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.hairline}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated volt arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.volt}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dashLength} ${gap}`}
          data-testid="ring-fill-arc"
          style={{
            filter:
              "drop-shadow(0 0 10px rgba(214,255,63,0.65)) drop-shadow(0 0 22px rgba(214,255,63,0.35))",
          }}
        />
      </svg>
      {/* Centre label */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: fonts.display,
            fontSize: size * 0.3,
            lineHeight: 0.9,
            color: colors.text,
          }}
          data-testid="ring-fill-centre-value"
        >
          {value}
        </span>
        {label && (
          <span
            style={{
              fontFamily: fonts.body,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase" as const,
              color: colors.muted,
              marginTop: 6,
            }}
            data-testid="ring-fill-label"
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
