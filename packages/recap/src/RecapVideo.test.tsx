import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mockUseCurrentFrame = vi.fn(() => 30);

vi.mock("remotion", () => ({
  useCurrentFrame: () => mockUseCurrentFrame(),
  interpolate: (
    input: number,
    inputRange: readonly number[],
    outputRange: readonly number[],
    options?: { extrapolateLeft?: string; extrapolateRight?: string },
  ) => {
    const [inMin, inMax] = [inputRange[0]!, inputRange[inputRange.length - 1]!];
    const [outMin, outMax] = [outputRange[0]!, outputRange[outputRange.length - 1]!];
    const leftExtrap = options?.extrapolateLeft ?? "extend";
    const rightExtrap = options?.extrapolateRight ?? "extend";
    if (input <= inMin!) return leftExtrap === "clamp" ? outMin! : outMin!;
    if (input >= inMax!) return rightExtrap === "clamp" ? outMax! : outMax!;
    const t = (input - inMin!) / (inMax! - inMin!);
    return outMin! + t * (outMax! - outMin!);
  },
  AbsoluteFill: ({ children, style, ...props }: React.PropsWithChildren<{ style?: React.CSSProperties; [key: string]: unknown }>) =>
    React.createElement("div", { style, ...props }, children),
}));

import { RecapVideo } from "./RecapVideo.js";
import type { RecapData } from "./types.js";

const baseData: RecapData = {
  title: "Run 5K",
  kind: "DAY",
  dayNumber: 7,
  lengthDays: 50,
  stats: {
    daysCompleted: 7,
    totalAmount: 35,
    unit: "km",
    currentStreak: 7,
  },
  days: [
    { dayKey: "day-1", completed: true, amount: 5, photoUrl: "http://a.test/1.jpg" },
    { dayKey: "day-2", completed: true, amount: 5 },
    { dayKey: "day-3", completed: false },
  ],
};

describe("RecapVideo — DAY kind", () => {
  beforeEach(() => mockUseCurrentFrame.mockReturnValue(30));

  it("renders the outer recap-video element", () => {
    render(<RecapVideo {...baseData} kind="DAY" />);
    expect(screen.getByTestId("recap-video")).toBeInTheDocument();
  });

  it("uses 'done' as ring label when unit is undefined (DAY ?? branch)", () => {
    const noUnit: RecapData = {
      ...baseData,
      stats: { ...baseData.stats, unit: undefined },
    };
    render(<RecapVideo {...noUnit} kind="DAY" />);
    // RingFill label prop receives "done" — it shows it in ring-fill-label
    expect(screen.getByTestId("ring-fill-label").textContent).toBe("done");
  });

  it("renders the title", () => {
    render(<RecapVideo {...baseData} kind="DAY" />);
    expect(screen.getByTestId("title-card-title").textContent).toBe("Run 5K");
  });

  it("renders the DAY kind label", () => {
    render(<RecapVideo {...baseData} kind="DAY" />);
    expect(screen.getByTestId("title-card-kind").textContent).toBe("Day recap");
  });

  it("renders a stat line with the correct days", () => {
    render(<RecapVideo {...baseData} kind="DAY" />);
    expect(screen.getByTestId("stat-part-0").textContent).toBe("7 days");
  });

  it("renders the ring fill for DAY layout", () => {
    render(<RecapVideo {...baseData} kind="DAY" />);
    expect(screen.getByTestId("ring-fill-container")).toBeInTheDocument();
  });

  it("renders photo strip with provided photos", () => {
    render(<RecapVideo {...baseData} kind="DAY" />);
    // Only days with photoUrl get passed — day-1 has one
    expect(screen.getByTestId("photo-strip-images")).toBeInTheDocument();
  });

  it("renders photo strip placeholder when no photos", () => {
    const noPhotos: RecapData = {
      ...baseData,
      days: [{ dayKey: "day-1", completed: true }],
    };
    render(<RecapVideo {...noPhotos} kind="DAY" />);
    expect(screen.getByTestId("photo-strip-placeholder")).toBeInTheDocument();
  });
});

describe("RecapVideo — WEEK kind", () => {
  beforeEach(() => mockUseCurrentFrame.mockReturnValue(30));

  const weekData: RecapData = {
    ...baseData,
    kind: "WEEK",
    days: [
      { dayKey: "d1", completed: true, amount: 5, photoUrl: "http://a.test/a.jpg" },
      { dayKey: "d2", completed: true, amount: 5 },
      { dayKey: "d3", completed: false },
      { dayKey: "d4", completed: true, amount: 6, photoUrl: "http://a.test/b.jpg" },
      { dayKey: "d5", completed: true },
      { dayKey: "d6", completed: false },
      { dayKey: "d7", completed: true },
    ],
  };

  it("renders the WEEK kind label", () => {
    render(<RecapVideo {...weekData} />);
    expect(screen.getByTestId("title-card-kind").textContent).toBe("Week recap");
  });

  it("renders BigNumber for days completed this week", () => {
    render(<RecapVideo {...weekData} />);
    expect(screen.getByTestId("big-number-value")).toBeInTheDocument();
  });

  it("renders stat line", () => {
    render(<RecapVideo {...weekData} />);
    expect(screen.getByTestId("stat-line")).toBeInTheDocument();
  });

  it("renders photo strip images when photos present", () => {
    render(<RecapVideo {...weekData} />);
    expect(screen.getByTestId("photo-strip-images")).toBeInTheDocument();
  });

  it("renders placeholder when no photos in week days", () => {
    const noPhotosWeek: RecapData = {
      ...weekData,
      days: weekData.days.map((d) => ({ ...d, photoUrl: undefined })),
    };
    render(<RecapVideo {...noPhotosWeek} />);
    expect(screen.getByTestId("photo-strip-placeholder")).toBeInTheDocument();
  });
});

describe("RecapVideo — FIFTY kind", () => {
  beforeEach(() => mockUseCurrentFrame.mockReturnValue(30));

  const fiftyData: RecapData = {
    ...baseData,
    kind: "FIFTY",
    dayNumber: 50,
    stats: {
      daysCompleted: 47,
      totalAmount: 211,
      unit: "km",
      currentStreak: 30,
    },
    days: Array.from({ length: 50 }, (_, i) => ({
      dayKey: `day-${i + 1}`,
      completed: i < 47,
      amount: i < 47 ? 5 : undefined,
      photoUrl: i < 3 ? `http://a.test/${i}.jpg` : undefined,
    })),
  };

  it("renders the FIFTY kind label", () => {
    render(<RecapVideo {...fiftyData} />);
    expect(screen.getByTestId("title-card-kind").textContent).toBe("50-day recap");
  });

  it("renders ring fill for total days arc", () => {
    render(<RecapVideo {...fiftyData} />);
    expect(screen.getByTestId("ring-fill-container")).toBeInTheDocument();
  });

  it("renders big number for total amount", () => {
    render(<RecapVideo {...fiftyData} />);
    expect(screen.getByTestId("big-number-value")).toBeInTheDocument();
  });

  it("renders stat line", () => {
    render(<RecapVideo {...fiftyData} />);
    expect(screen.getByTestId("stat-line")).toBeInTheDocument();
  });

  it("renders photo strip images from photoUrl days", () => {
    render(<RecapVideo {...fiftyData} />);
    expect(screen.getByTestId("photo-strip-images")).toBeInTheDocument();
  });

  it("renders placeholder when none of the 50 days have photos", () => {
    const allNoPhotos: RecapData = {
      ...fiftyData,
      days: fiftyData.days.map((d) => ({ ...d, photoUrl: undefined })),
    };
    render(<RecapVideo {...allNoPhotos} />);
    expect(screen.getByTestId("photo-strip-placeholder")).toBeInTheDocument();
  });

  it("uses 'total' as BigNumber unit when stats.unit is undefined (FIFTY ?? branch)", () => {
    const noUnit: RecapData = {
      ...fiftyData,
      stats: { ...fiftyData.stats, unit: undefined },
    };
    render(<RecapVideo {...noUnit} />);
    expect(screen.getByTestId("big-number-unit").textContent).toBe("total");
  });
});
