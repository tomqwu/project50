import React from "react";
import { Composition, registerRoot } from "remotion";
import { RecapVideo } from "./RecapVideo.js";
import type { RecapData } from "./types.js";

/**
 * Default props used when previewing in the Remotion Studio.
 * These are overridden at render time with real `RecapData`.
 */
const defaultProps: RecapData = {
  title: "Work out 1 hr",
  kind: "DAY",
  dayNumber: 1,
  lengthDays: 50,
  stats: {
    daysCompleted: 1,
    totalAmount: 60,
    unit: "min",
    currentStreak: 1,
  },
  days: [
    {
      dayKey: "day-1",
      completed: true,
      amount: 60,
    },
  ],
};

export function RemotionRoot() {
  return (
    <Composition
      id="recap"
      component={RecapVideo}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
    />
  );
}

registerRoot(RemotionRoot);
