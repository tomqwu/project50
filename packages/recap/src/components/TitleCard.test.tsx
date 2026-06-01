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

import { TitleCard } from "./TitleCard.js";

describe("TitleCard", () => {
  beforeEach(() => {
    mockUseCurrentFrame.mockReturnValue(0);
  });

  it("renders title text", () => {
    render(<TitleCard title="Run 5K" kind="DAY" dayNumber={7} lengthDays={50} />);
    expect(screen.getByTestId("title-card-title").textContent).toBe("Run 5K");
  });

  it("renders 'Day recap' label for DAY kind", () => {
    render(<TitleCard title="Run" kind="DAY" dayNumber={1} lengthDays={50} />);
    expect(screen.getByTestId("title-card-kind").textContent).toBe("Day recap");
  });

  it("renders 'Week recap' label for WEEK kind", () => {
    render(<TitleCard title="Run" kind="WEEK" dayNumber={7} lengthDays={50} />);
    expect(screen.getByTestId("title-card-kind").textContent).toBe("Week recap");
  });

  it("renders '50-day recap' label for FIFTY kind", () => {
    render(<TitleCard title="Run" kind="FIFTY" dayNumber={50} lengthDays={50} />);
    expect(screen.getByTestId("title-card-kind").textContent).toBe("50-day recap");
  });

  it("renders day progress line", () => {
    render(<TitleCard title="Run" kind="DAY" dayNumber={23} lengthDays={50} />);
    const day = screen.getByTestId("title-card-day").textContent ?? "";
    expect(day).toContain("23");
    expect(day).toContain("50");
  });

  it("is invisible (opacity 0) at frame 0 (before animation)", () => {
    mockUseCurrentFrame.mockReturnValue(0);
    render(<TitleCard title="Run" kind="DAY" dayNumber={1} lengthDays={50} animationFrames={30} />);
    const card = screen.getByTestId("title-card");
    expect((card as HTMLElement).style.opacity).toBe("0");
  });

  it("is fully visible (opacity 1) after animation completes", () => {
    mockUseCurrentFrame.mockReturnValue(30);
    render(<TitleCard title="Run" kind="DAY" dayNumber={1} lengthDays={50} animationFrames={30} />);
    const card = screen.getByTestId("title-card");
    expect((card as HTMLElement).style.opacity).toBe("1");
  });

  it("has partial opacity mid-animation", () => {
    mockUseCurrentFrame.mockReturnValue(15); // halfway through 30-frame fade
    render(<TitleCard title="Run" kind="DAY" dayNumber={1} lengthDays={50} animationFrames={30} />);
    const card = screen.getByTestId("title-card");
    const opacity = Number((card as HTMLElement).style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it("has positive translateY at frame 0 (slides from below)", () => {
    mockUseCurrentFrame.mockReturnValue(0);
    render(<TitleCard title="Run" kind="DAY" dayNumber={1} lengthDays={50} animationFrames={30} />);
    const card = screen.getByTestId("title-card");
    const transform = (card as HTMLElement).style.transform;
    // Should be translateY(40px) — starts from 40px below
    expect(transform).toContain("translateY(40px)");
  });

  it("clamps translateY to 0 once animation completes", () => {
    mockUseCurrentFrame.mockReturnValue(60);
    render(<TitleCard title="Run" kind="DAY" dayNumber={1} lengthDays={50} animationFrames={30} />);
    const card = screen.getByTestId("title-card");
    expect((card as HTMLElement).style.transform).toContain("translateY(0px)");
  });
});
