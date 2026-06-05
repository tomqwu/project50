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

  it("renders no per-day share controls without a shareId", () => {
    render(<Project50Calendar days={makeDays()} />);
    expect(screen.queryByTestId("share-day-button")).not.toBeInTheDocument();
  });

  it("renders a share control on each complete day when a shareId is given", () => {
    const days: Project50HistoryDay[] = [
      { dayNumber: 1, dayKey: "2026-06-01", status: "complete" },
      { dayNumber: 2, dayKey: "2026-06-02", status: "incomplete" },
      { dayNumber: 3, dayKey: "2026-06-03", status: "complete" },
      { dayNumber: 4, dayKey: "2026-06-04", status: "today" },
      { dayNumber: 5, dayKey: "2026-06-05", status: "future" },
    ];
    render(<Project50Calendar days={days} shareId="share-abc" />);
    // Two complete days → two share buttons (today is 0/7 here, so not shown).
    expect(screen.getAllByTestId("share-day-button")).toHaveLength(2);
  });

  it("shares the active day too once it is 7/7", () => {
    const days: Project50HistoryDay[] = [
      { dayNumber: 1, dayKey: "2026-06-01", status: "complete" },
      { dayNumber: 2, dayKey: "2026-06-02", status: "today" },
    ];
    render(<Project50Calendar days={days} shareId="share-abc" todayCompletedCount={7} />);
    // 1 complete + the active day at 7/7 = 2 share buttons.
    expect(screen.getAllByTestId("share-day-button")).toHaveLength(2);
  });

  it("does NOT share the active day when it is below 7/7", () => {
    const days: Project50HistoryDay[] = [
      { dayNumber: 1, dayKey: "2026-06-01", status: "today" },
    ];
    render(<Project50Calendar days={days} shareId="share-abc" todayCompletedCount={6} />);
    expect(screen.queryByTestId("share-day-button")).not.toBeInTheDocument();
  });
});
