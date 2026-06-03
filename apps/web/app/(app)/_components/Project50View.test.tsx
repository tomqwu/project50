import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Project50View } from "./Project50View";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
});

describe("Project50View", () => {
  it("NONE: renders the start choice with both options", () => {
    render(<Project50View state={{ status: "NONE" }} onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByRole("button", { name: /start project 50/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /custom plan/i })).toHaveAttribute("href", "/challenges/new");
  });

  it("ACTIVE: renders Day n/50, 7 rule rows, and toggles a rule", () => {
    const onToggle = vi.fn();
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-06-02", dayNumber: 3, checks: [true,false,false,false,false,false,false], completedCount: 1 } }}
        onStart={vi.fn()} onToggle={onToggle} onRestart={vi.fn()}
      />,
    );
    expect(screen.getByText(/Day 3 \/ 50/)).toBeInTheDocument();
    expect(screen.getAllByTestId(/rule-row-/)).toHaveLength(7);
    fireEvent.click(screen.getByTestId("rule-row-2"));
    expect(onToggle).toHaveBeenCalledWith(2, true); // rule 2 was unchecked → toggles to true
  });

  it("FAILED: shows the missed day + rule and a restart button", () => {
    const onRestart = vi.fn();
    render(<Project50View state={{ status: "FAILED", failedDayNumber: 12, failedRuleId: 3 }} onStart={vi.fn()} onToggle={vi.fn()} onRestart={onRestart} />);
    expect(screen.getByText(/Day 12/)).toBeInTheDocument();
    expect(screen.getByText(/Exercise/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /start over/i }));
    expect(onRestart).toHaveBeenCalled();
  });
});
