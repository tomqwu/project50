import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens.js";
import type { RecapKind } from "../types.js";

export interface TitleCardProps {
  title: string;
  kind: RecapKind;
  /** Day number within the challenge, used for the DAY label. */
  dayNumber: number;
  /** Total length of the challenge in days (e.g. 50). */
  lengthDays: number;
  /** Frames over which title slides+fades in (default 30). */
  animationFrames?: number;
}

const KIND_LABELS: Record<RecapKind, string> = {
  DAY: "Day recap",
  WEEK: "Week recap",
  FIFTY: "50-day recap",
};

/**
 * Title card with challenge name and kind label. Fades and slides up from below
 * over `animationFrames` frames.
 */
export function TitleCard({
  title,
  kind,
  dayNumber,
  lengthDays,
  animationFrames = 30,
}: TitleCardProps) {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, animationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(frame, [0, animationFrames], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      data-testid="title-card"
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Kind badge */}
      <div
        data-testid="title-card-kind"
        style={{
          display: "inline-block",
          border: `1.5px solid ${colors.volt}`,
          color: colors.volt,
          borderRadius: 999,
          padding: "5px 14px",
          fontFamily: fonts.body,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase" as const,
          alignSelf: "flex-start",
        }}
      >
        {KIND_LABELS[kind]}
      </div>

      {/* Main title */}
      <div
        data-testid="title-card-title"
        style={{
          fontFamily: fonts.display,
          fontSize: 72,
          lineHeight: 0.9,
          color: colors.text,
          textTransform: "uppercase" as const,
        }}
      >
        {title}
      </div>

      {/* Day progress sub-line */}
      <div
        data-testid="title-card-day"
        style={{
          fontFamily: fonts.body,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
          color: colors.muted,
          marginTop: 4,
        }}
      >
        Day {dayNumber} / {lengthDays}
      </div>
    </div>
  );
}
