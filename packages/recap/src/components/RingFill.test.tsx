import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mockUseCurrentFrame = vi.fn(() => 0);

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

import { RingFill } from "./RingFill.js";

describe("RingFill", () => {
  beforeEach(() => {
    mockUseCurrentFrame.mockReturnValue(0);
  });

  it("renders the container and SVG", () => {
    render(<RingFill value={30} max={50} />);
    expect(screen.getByTestId("ring-fill-container")).toBeInTheDocument();
    expect(screen.getByTestId("ring-fill-svg")).toBeInTheDocument();
  });

  it("shows 0 dash at frame 0 (arc starts empty)", () => {
    mockUseCurrentFrame.mockReturnValue(0);
    render(<RingFill value={25} max={50} animationFrames={90} />);
    const arc = screen.getByTestId("ring-fill-arc");
    const dashArray = arc.getAttribute("stroke-dasharray") ?? "";
    const [dashLen] = dashArray.split(" ").map(Number);
    // At frame 0, animatedFraction = 0 → dashLength = 0
    expect(dashLen).toBeCloseTo(0, 1);
  });

  it("shows partial fill at mid frame", () => {
    mockUseCurrentFrame.mockReturnValue(45); // halfway through 90-frame animation
    render(<RingFill value={50} max={50} animationFrames={90} size={240} strokeWidth={18} />);
    const arc = screen.getByTestId("ring-fill-arc");
    const dashArray = arc.getAttribute("stroke-dasharray") ?? "";
    const [dashLen] = dashArray.split(" ").map(Number);
    // targetFraction = 1, animatedFraction at 45/90 = 0.5
    // circumference = 2π * (240-18)/2 = 2π * 111 ≈ 697.6
    // expected dash = 697.6 * 0.5 ≈ 348.8
    expect(dashLen!).toBeGreaterThan(300);
    expect(dashLen!).toBeLessThan(400);
  });

  it("shows full fill when frame >= animationFrames (clamp)", () => {
    mockUseCurrentFrame.mockReturnValue(120);
    render(<RingFill value={50} max={50} animationFrames={90} size={240} strokeWidth={18} />);
    const arc = screen.getByTestId("ring-fill-arc");
    const dashArray = arc.getAttribute("stroke-dasharray") ?? "";
    const [dashLen] = dashArray.split(" ").map(Number);
    // Full circumference ≈ 697.6
    expect(dashLen!).toBeGreaterThan(690);
  });

  it("caps fill at 1 when value > max", () => {
    mockUseCurrentFrame.mockReturnValue(90);
    render(<RingFill value={100} max={50} animationFrames={90} size={240} strokeWidth={18} />);
    const arc = screen.getByTestId("ring-fill-arc");
    const dashArray = arc.getAttribute("stroke-dasharray") ?? "";
    const parts = dashArray.split(" ").map(Number);
    const [dashLen, gapLen] = parts;
    // gap should be 0 (full ring)
    expect(gapLen!).toBeCloseTo(0, 0);
    expect(dashLen!).toBeGreaterThan(690);
  });

  it("renders centre value", () => {
    render(<RingFill value={23} max={50} />);
    expect(screen.getByTestId("ring-fill-centre-value").textContent).toBe("23");
  });

  it("renders label when provided", () => {
    render(<RingFill value={10} max={50} label="days" />);
    expect(screen.getByTestId("ring-fill-label").textContent).toBe("days");
  });

  it("omits label element when not provided", () => {
    render(<RingFill value={10} max={50} />);
    expect(screen.queryByTestId("ring-fill-label")).toBeNull();
  });

  it("handles max=0 gracefully (zero-division guard)", () => {
    mockUseCurrentFrame.mockReturnValue(90);
    render(<RingFill value={0} max={0} animationFrames={90} />);
    const arc = screen.getByTestId("ring-fill-arc");
    const dashArray = arc.getAttribute("stroke-dasharray") ?? "";
    const [dashLen] = dashArray.split(" ").map(Number);
    expect(dashLen).toBeCloseTo(0, 1);
  });
});
