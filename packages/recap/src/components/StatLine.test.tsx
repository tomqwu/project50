import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// StatLine has no Remotion hooks but we still mock for consistent module graph.
vi.mock("remotion", () => ({
  useCurrentFrame: () => 0,
  interpolate: () => 0,
  AbsoluteFill: ({ children, style, ...props }: React.PropsWithChildren<{ style?: React.CSSProperties; [key: string]: unknown }>) =>
    React.createElement("div", { style, ...props }, children),
}));

import { StatLine } from "./StatLine.js";

describe("StatLine", () => {
  it("renders daysCompleted with singular label for 1 day", () => {
    render(
      <StatLine daysCompleted={1} totalAmount={60} unit="min" currentStreak={1} />,
    );
    expect(screen.getByTestId("stat-part-0").textContent).toBe("1 day");
  });

  it("renders daysCompleted with plural label for multiple days", () => {
    render(
      <StatLine daysCompleted={7} totalAmount={420} unit="min" currentStreak={7} />,
    );
    expect(screen.getByTestId("stat-part-0").textContent).toBe("7 days");
  });

  it("includes totalAmount with unit when totalAmount > 0", () => {
    render(
      <StatLine daysCompleted={5} totalAmount={211} unit="km" currentStreak={5} />,
    );
    expect(screen.getByTestId("stat-part-1").textContent).toBe("211 km");
  });

  it("omits totalAmount part when totalAmount is 0", () => {
    render(
      <StatLine daysCompleted={3} totalAmount={0} currentStreak={3} />,
    );
    // Only 2 parts: days + streak (no amount)
    expect(screen.getByTestId("stat-part-0").textContent).toBe("3 days");
    expect(screen.getByTestId("stat-part-1").textContent).toBe("3 streak");
    expect(screen.queryByTestId("stat-part-2")).toBeNull();
  });

  it("renders amount without unit when unit is undefined", () => {
    render(
      <StatLine daysCompleted={2} totalAmount={10} currentStreak={2} />,
    );
    expect(screen.getByTestId("stat-part-1").textContent).toBe("10");
  });

  it("renders streak in the last part", () => {
    render(
      <StatLine daysCompleted={10} totalAmount={500} unit="min" currentStreak={8} />,
    );
    expect(screen.getByTestId("stat-part-2").textContent).toBe("8 streak");
  });

  it("renders the stat-line container", () => {
    render(
      <StatLine daysCompleted={1} totalAmount={30} unit="min" currentStreak={1} />,
    );
    expect(screen.getByTestId("stat-line")).toBeInTheDocument();
  });
});
