import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CelebrateView, type CelebrateViewProps, type MilestoneKind } from "./CelebrateView";

afterEach(() => {
  cleanup();
});

function makeProps(overrides: Partial<CelebrateViewProps> = {}): CelebrateViewProps {
  return {
    challengeTitle: "Run 5K",
    dayNumber: 25,
    stats: { daysCompleted: 25, totalAmount: 125, unit: "km" },
    milestones: [],
    ...overrides,
  };
}

describe("CelebrateView — in-progress milestone", () => {
  it("renders 'Milestone reached' label and challenge title when dayNumber < 50", () => {
    render(<CelebrateView {...makeProps({ dayNumber: 25 })} />);
    expect(screen.getByText("Milestone reached")).toBeInTheDocument();
    expect(screen.getByTestId("celebrate-title")).toHaveTextContent("Run 5K");
  });

  it("renders day number", () => {
    render(<CelebrateView {...makeProps({ dayNumber: 25 })} />);
    expect(screen.getByText("Day 25 / 50")).toBeInTheDocument();
  });

  it("renders days completed stat tile", () => {
    render(<CelebrateView {...makeProps()} />);
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("Days done")).toBeInTheDocument();
  });

  it("renders total amount stat when totalAmount is set", () => {
    render(<CelebrateView {...makeProps()} />);
    expect(screen.getByText("125 km")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("does NOT render total stat when totalAmount is null", () => {
    render(<CelebrateView {...makeProps({ stats: { daysCompleted: 25, totalAmount: null, unit: "km" } })} />);
    expect(screen.queryByText("Total")).toBeNull();
  });

  it("does NOT render total stat when totalAmount is undefined", () => {
    render(<CelebrateView {...makeProps({ stats: { daysCompleted: 25 } })} />);
    expect(screen.queryByText("Total")).toBeNull();
  });

  it("renders earned badges when milestones present", () => {
    const ms: MilestoneKind[] = ["COMPLETED_7", "STREAK_7"];
    render(<CelebrateView {...makeProps({ milestones: ms })} />);
    expect(screen.getByTestId("badge-COMPLETED_7")).toHaveTextContent("7 days done");
    expect(screen.getByTestId("badge-STREAK_7")).toHaveTextContent("7-day streak");
    expect(screen.getByText("Earned badges")).toBeInTheDocument();
  });

  it("does NOT render badges section when no milestones", () => {
    render(<CelebrateView {...makeProps({ milestones: [] })} />);
    expect(screen.queryByText("Earned badges")).toBeNull();
  });

  it("renders disabled share buttons with coming-soon note", () => {
    render(<CelebrateView {...makeProps()} />);
    const saveBtn = screen.getByRole("button", { name: /Save image/i });
    const linkBtn = screen.getByRole("button", { name: /Public link/i });
    const shareBtn = screen.getByRole("button", { name: /Share/i });
    expect(saveBtn).toBeDisabled();
    expect(linkBtn).toBeDisabled();
    expect(shareBtn).toBeDisabled();
    expect(screen.getByTestId("coming-soon-note")).toBeInTheDocument();
  });
});

describe("CelebrateView — day 50 complete", () => {
  it("renders 'Challenge complete' label and 'Day 50 complete' title", () => {
    render(<CelebrateView {...makeProps({ dayNumber: 50 })} />);
    expect(screen.getByText("Challenge complete")).toBeInTheDocument();
    expect(screen.getByTestId("celebrate-title")).toHaveTextContent("Day 50 complete");
  });

  it("renders with day > 50 as complete", () => {
    render(<CelebrateView {...makeProps({ dayNumber: 52 })} />);
    expect(screen.getByTestId("celebrate-title")).toHaveTextContent("Day 50 complete");
  });

  it("renders all milestone kinds", () => {
    const all: MilestoneKind[] = [
      "COMPLETED_7",
      "COMPLETED_25",
      "COMPLETED_50",
      "STREAK_7",
      "STREAK_30",
    ];
    render(<CelebrateView {...makeProps({ dayNumber: 50, milestones: all })} />);
    expect(screen.getByTestId("badge-COMPLETED_50")).toHaveTextContent("50 days done");
    expect(screen.getByTestId("badge-STREAK_30")).toHaveTextContent("30-day streak");
  });

  it("renders total without unit when unit is null", () => {
    render(
      <CelebrateView
        {...makeProps({
          dayNumber: 50,
          stats: { daysCompleted: 50, totalAmount: 200, unit: null },
        })}
      />,
    );
    expect(screen.getByText("200")).toBeInTheDocument();
  });
});
