import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Project50Calendar } from "./Project50Calendar";
import type { Project50HistoryDay } from "@/lib/project50";

afterEach(() => {
  cleanup();
});

function makeDays(): Project50HistoryDay[] {
  const statuses = ["complete", "incomplete", "today", "future"] as const;
  return Array.from({ length: 50 }, (_, i) => ({
    dayNumber: i + 1,
    dayKey: `2026-06-${String(i + 1).padStart(2, "0")}`,
    status: statuses[i % statuses.length]!,
  }));
}

describe("Project50Calendar", () => {
  it("renders 50 day cells with their day numbers", () => {
    render(<Project50Calendar days={makeDays()} />);
    const cells = screen.getAllByTestId(/^day-cell-/);
    expect(cells).toHaveLength(50);
    expect(screen.getByTestId("day-cell-1")).toHaveTextContent("1");
    expect(screen.getByTestId("day-cell-50")).toHaveTextContent("50");
  });

  it("tags each cell with its status via data-status", () => {
    render(<Project50Calendar days={makeDays()} />);
    expect(screen.getByTestId("day-cell-1")).toHaveAttribute("data-status", "complete");
    expect(screen.getByTestId("day-cell-2")).toHaveAttribute("data-status", "incomplete");
    expect(screen.getByTestId("day-cell-3")).toHaveAttribute("data-status", "today");
    expect(screen.getByTestId("day-cell-4")).toHaveAttribute("data-status", "future");
  });

  it("marks the today cell as the current day for assistive tech", () => {
    render(<Project50Calendar days={makeDays()} />);
    // index 2 (dayNumber 3) is "today"
    expect(screen.getByTestId("day-cell-3")).toHaveAttribute("aria-current", "date");
    expect(screen.getByTestId("day-cell-1")).not.toHaveAttribute("aria-current");
  });

  it("renders nothing when there are no days", () => {
    const { container } = render(<Project50Calendar days={[]} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId(/^day-cell-/)).not.toBeInTheDocument();
  });
});
