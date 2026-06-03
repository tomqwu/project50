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

  it("ACTIVE: info button toggles help panel without toggling the rule", () => {
    const onToggle = vi.fn();
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-06-02", dayNumber: 3, checks: [false,false,false,false,false,false,false], completedCount: 0 } }}
        onStart={vi.fn()} onToggle={onToggle} onRestart={vi.fn()}
      />,
    );
    // help panel hidden initially
    expect(screen.queryByTestId("rule-help-panel-3")).not.toBeInTheDocument();
    const helpBtn = screen.getByTestId("rule-help-3");
    fireEvent.click(helpBtn);
    // panel now visible and shows the rule detail
    const panel = screen.getByTestId("rule-help-panel-3");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(/1 hour, any activity/i);
    // clicking the info button must NOT toggle the rule
    expect(onToggle).not.toHaveBeenCalled();
    // clicking again collapses the panel
    fireEvent.click(helpBtn);
    expect(screen.queryByTestId("rule-help-panel-3")).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("ACTIVE: opening help for another rule replaces the open panel, toggle still works", () => {
    const onToggle = vi.fn();
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-06-02", dayNumber: 5, checks: [false,false,false,false,false,false,false], completedCount: 0 } }}
        onStart={vi.fn()} onToggle={onToggle} onRestart={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("rule-help-1"));
    expect(screen.getByTestId("rule-help-panel-1")).toBeInTheDocument();
    // open a different rule's help → first one closes
    fireEvent.click(screen.getByTestId("rule-help-4"));
    expect(screen.queryByTestId("rule-help-panel-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("rule-help-panel-4")).toBeInTheDocument();
    // the toggle row still works independently
    fireEvent.click(screen.getByTestId("rule-row-1"));
    expect(onToggle).toHaveBeenCalledWith(1, true);
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
