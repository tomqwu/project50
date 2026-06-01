import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("./CheerButton", () => ({
  CheerButton: ({ activityId, count }: { activityId: string; count: number }) => (
    <button data-testid="cheer-button" data-activity-id={activityId}>
      {count}
    </button>
  ),
}));

import { FeedView, type FeedActivity } from "./FeedView";

afterEach(() => {
  cleanup();
});

const sampleItems: FeedActivity[] = [
  {
    id: "a1",
    userHandle: "@alice",
    challengeTitle: "Run 5K",
    dayKey: "2026-06-01",
    note: "Great run!",
    hasPhoto: false,
    cheerCount: 3,
  },
  {
    id: "a2",
    userHandle: "@bob",
    challengeTitle: "Meditation",
    dayKey: "2026-06-01",
    note: null,
    hasPhoto: true,
    cheerCount: 0,
  },
];

describe("FeedView", () => {
  it("shows empty state when no items", () => {
    render(<FeedView items={[]} />);
    expect(screen.getByTestId("feed-empty")).toBeInTheDocument();
    expect(screen.getByText(/No activity from people you follow/)).toBeInTheDocument();
  });

  it("renders feed items with handle, challenge title, and day", () => {
    render(<FeedView items={sampleItems} />);
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText("Run 5K")).toBeInTheDocument();
    expect(screen.getByText("@bob")).toBeInTheDocument();
    expect(screen.getByText("Meditation")).toBeInTheDocument();
  });

  it("renders note when present", () => {
    render(<FeedView items={sampleItems} />);
    expect(screen.getByTestId("feed-item-note")).toHaveTextContent("Great run!");
  });

  it("does NOT render note element when note is null", () => {
    const noNote: FeedActivity[] = [{ ...sampleItems[0]!, note: null }];
    render(<FeedView items={noNote} />);
    expect(screen.queryByTestId("feed-item-note")).toBeNull();
  });

  it("renders photo placeholder when hasPhoto is true", () => {
    render(<FeedView items={sampleItems} />);
    expect(screen.getByTestId("photo-placeholder")).toBeInTheDocument();
  });

  it("does NOT render photo placeholder when hasPhoto is false", () => {
    const noPhoto: FeedActivity[] = [{ ...sampleItems[0]!, hasPhoto: false }];
    render(<FeedView items={noPhoto} />);
    expect(screen.queryByTestId("photo-placeholder")).toBeNull();
  });

  it("renders CheerButton for each item", () => {
    render(<FeedView items={sampleItems} />);
    const cheerButtons = screen.getAllByTestId("cheer-button");
    expect(cheerButtons).toHaveLength(2);
  });
});
