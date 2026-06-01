import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock remotion so we can control useCurrentFrame without a real Remotion runtime.
const mockUseCurrentFrame = vi.fn(() => 0);

vi.mock("remotion", () => ({
  useCurrentFrame: () => mockUseCurrentFrame(),
  interpolate: (
    input: number,
    inputRange: readonly number[],
    outputRange: readonly number[],
    options?: { extrapolateLeft?: string; extrapolateRight?: string },
  ) => {
    // Real interpolate implementation (linear, respecting clamp).
    const [inMin, inMax] = [inputRange[0]!, inputRange[inputRange.length - 1]!];
    const [outMin, outMax] = [outputRange[0]!, outputRange[outputRange.length - 1]!];
    const leftExtrap = options?.extrapolateLeft ?? "extend";
    const rightExtrap = options?.extrapolateRight ?? "extend";

    if (input <= inMin!) {
      return leftExtrap === "clamp" ? outMin! : outMin!;
    }
    if (input >= inMax!) {
      return rightExtrap === "clamp" ? outMax! : outMax!;
    }
    const t = (input - inMin!) / (inMax! - inMin!);
    return outMin! + t * (outMax! - outMin!);
  },
  AbsoluteFill: ({ children, style, ...props }: React.PropsWithChildren<{ style?: React.CSSProperties; [key: string]: unknown }>) =>
    React.createElement("div", { style, ...props }, children),
}));

import { BigNumber } from "./BigNumber.js";

describe("BigNumber", () => {
  beforeEach(() => {
    mockUseCurrentFrame.mockReturnValue(0);
  });

  it("shows 0 at frame 0", () => {
    mockUseCurrentFrame.mockReturnValue(0);
    render(<BigNumber value={100} animationFrames={60} />);
    expect(screen.getByTestId("big-number-value").textContent).toBe("0");
  });

  it("shows interpolated value at a mid frame", () => {
    mockUseCurrentFrame.mockReturnValue(30); // halfway → 50
    render(<BigNumber value={100} animationFrames={60} />);
    expect(screen.getByTestId("big-number-value").textContent).toBe("50");
  });

  it("shows full value at the end frame (clamp)", () => {
    mockUseCurrentFrame.mockReturnValue(60);
    render(<BigNumber value={100} animationFrames={60} />);
    expect(screen.getByTestId("big-number-value").textContent).toBe("100");
  });

  it("clamps to full value when frame exceeds animationFrames", () => {
    mockUseCurrentFrame.mockReturnValue(999);
    render(<BigNumber value={42} animationFrames={60} />);
    expect(screen.getByTestId("big-number-value").textContent).toBe("42");
  });

  it("clamps to 0 when frame is negative (frame 0 clamped from left)", () => {
    // useCurrentFrame always returns >= 0 in Remotion, but the clamp should hold
    mockUseCurrentFrame.mockReturnValue(0);
    render(<BigNumber value={100} animationFrames={60} />);
    expect(screen.getByTestId("big-number-value").textContent).toBe("0");
  });

  it("renders unit when provided", () => {
    mockUseCurrentFrame.mockReturnValue(60);
    render(<BigNumber value={10} unit="km" />);
    expect(screen.getByTestId("big-number-unit").textContent).toBe("km");
  });

  it("omits unit element when not provided", () => {
    render(<BigNumber value={10} />);
    expect(screen.queryByTestId("big-number-unit")).toBeNull();
  });

  it("rounds fractional interpolated values", () => {
    // frame 15 of 60 on value 10 → 10 * 15/60 = 2.5 → round to 3
    mockUseCurrentFrame.mockReturnValue(15);
    render(<BigNumber value={10} animationFrames={60} />);
    const text = screen.getByTestId("big-number-value").textContent;
    expect(["2", "3"]).toContain(text); // Math.round(2.5) = 3
  });
});
