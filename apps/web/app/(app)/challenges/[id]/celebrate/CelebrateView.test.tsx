import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CelebrateView, type CelebrateViewProps, type MilestoneKind } from "./CelebrateView";

// Mock ShareActions to isolate CelebrateView tests
vi.mock("./ShareActions", () => ({
  ShareActions: ({ challengeId, visibility }: { challengeId: string; shareId: string; visibility: string }) => (
    <div data-testid="share-actions" data-challenge-id={challengeId} data-visibility={visibility} />
  ),
}));

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

  it("does not render ShareActions when shareActions prop is not provided", () => {
    render(<CelebrateView {...makeProps()} />);
    expect(screen.queryByTestId("share-actions")).toBeNull();
  });

  it("renders ShareActions when shareActions prop is provided", () => {
    render(
      <CelebrateView
        {...makeProps()}
        shareActions={{ challengeId: "c1", shareId: "s1", visibility: "PUBLIC" }}
      />,
    );
    const actions = screen.getByTestId("share-actions");
    expect(actions).toBeInTheDocument();
    expect(actions).toHaveAttribute("data-challenge-id", "c1");
    expect(actions).toHaveAttribute("data-visibility", "PUBLIC");
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
