import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  DashboardView,
  type DashboardViewProps,
  type PrimaryChallenge,
  type ChallengeItem,
} from "./DashboardView";

// Mock Link from next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    style,
  }: {
    href: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
  }) => (
    <a href={href} style={style}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

const baseTarget: PrimaryChallenge = {
  id: "c1",
  title: "Run 5K",
  goalType: "TARGET",
  unit: "km",
  dayNumber: 12,
  today: { totalAmount: 3, target: 5, completed: false },
  currentStreak: 7,
  badges: 2,
  cheering: 14,
};

const baseBinary: PrimaryChallenge = {
  id: "c2",
  title: "Meditation",
  goalType: "BINARY",
  unit: null,
  dayNumber: 5,
  today: { totalAmount: 0, target: 1, completed: false },
  currentStreak: 3,
  badges: 0,
  cheering: 0,
};

function makeProps(
  primary: PrimaryChallenge | null,
  challenges: ChallengeItem[] = [],
): DashboardViewProps {
  return { primary, challenges };
}

describe("DashboardView — empty state", () => {
  it("shows 'No active challenges yet.' when primary is null", () => {
    render(<DashboardView primary={null} challenges={[]} />);
    expect(screen.getByText(/No active challenges yet/)).toBeInTheDocument();
  });
});

describe("DashboardView — TARGET challenge", () => {
  it("renders challenge title", () => {
    render(<DashboardView {...makeProps(baseTarget, [baseTarget])} />);
    expect(screen.getByText("Run 5K")).toBeInTheDocument();
  });

  it("renders Day N/50", () => {
    render(<DashboardView {...makeProps(baseTarget, [baseTarget])} />);
    expect(screen.getByTestId("day-number")).toHaveTextContent("Day 12 / 50");
  });

  it("renders ProgressRing with value/max label", () => {
    render(<DashboardView {...makeProps(baseTarget, [baseTarget])} />);
    expect(screen.getByRole("img", { name: /3 \/ 5/ })).toBeInTheDocument();
  });

  it("renders StatTiles: streak/badges/cheering", () => {
    render(<DashboardView {...makeProps(baseTarget, [baseTarget])} />);
    expect(screen.getByText("Day streak")).toBeInTheDocument();
    expect(screen.getByText("Badges")).toBeInTheDocument();
    expect(screen.getByText("Cheering")).toBeInTheDocument();
    // Values
    expect(screen.getByText("7")).toBeInTheDocument(); // streak
    expect(screen.getByText("2")).toBeInTheDocument(); // badges
    expect(screen.getByText("14")).toBeInTheDocument(); // cheering
  });

  it("renders 'Log an activity' link pointing to /challenges/:id/log", () => {
    render(<DashboardView {...makeProps(baseTarget, [baseTarget])} />);
    const link = screen.getByRole("link", { name: /Log an activity/i });
    expect(link).toHaveAttribute("href", "/challenges/c1/log");
  });

  it("shows completed ring (value=max) for completed TARGET day", () => {
    const completed: PrimaryChallenge = {
      ...baseTarget,
      today: { totalAmount: 5, target: 5, completed: true },
    };
    render(<DashboardView {...makeProps(completed, [completed])} />);
    expect(screen.getByRole("img", { name: /5 \/ 5/ })).toBeInTheDocument();
  });

  it("renders other challenges list when present", () => {
    const other: ChallengeItem = { id: "c9", title: "Yoga 20min", goalType: "BINARY" };
    render(<DashboardView primary={baseTarget} challenges={[baseTarget, other]} />);
    expect(screen.getByText("Yoga 20min")).toBeInTheDocument();
    expect(screen.getByText("Other challenges")).toBeInTheDocument();
  });

  it("does NOT render other challenges section when only primary is present", () => {
    render(<DashboardView primary={baseTarget} challenges={[baseTarget]} />);
    expect(screen.queryByText("Other challenges")).toBeNull();
  });
});

describe("DashboardView — BINARY challenge", () => {
  it("renders ring with 0/1 when not done", () => {
    render(<DashboardView {...makeProps(baseBinary, [baseBinary])} />);
    expect(screen.getByRole("img", { name: "Not done" })).toBeInTheDocument();
  });

  it("renders ring with 1/1 when done", () => {
    const done: PrimaryChallenge = {
      ...baseBinary,
      today: { totalAmount: 0, target: 1, completed: true },
    };
    render(<DashboardView {...makeProps(done, [done])} />);
    expect(screen.getByRole("img", { name: "Done" })).toBeInTheDocument();
  });

  it("handles null today gracefully", () => {
    const noToday: PrimaryChallenge = { ...baseBinary, today: null };
    render(<DashboardView {...makeProps(noToday, [noToday])} />);
    // Ring should render without crash; 0/1 not done
    expect(screen.getByRole("img", { name: "Not done" })).toBeInTheDocument();
  });
});

describe("DashboardView — TARGET with null unit", () => {
  it("trims unit label when unit is null", () => {
    const noUnit: PrimaryChallenge = {
      ...baseTarget,
      unit: null,
      today: { totalAmount: 2, target: 5, completed: false },
    };
    render(<DashboardView {...makeProps(noUnit, [noUnit])} />);
    // Label should be "2 / 5" (no trailing space)
    expect(screen.getByRole("img", { name: "2 / 5" })).toBeInTheDocument();
  });
});
