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
    media: [],
  },
  {
    id: "a2",
    userHandle: "@bob",
    challengeTitle: "Meditation",
    dayKey: "2026-06-01",
    note: null,
    hasPhoto: true,
    cheerCount: 0,
    media: [],
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

  it("renders photo placeholder when hasPhoto is true but no media URL", () => {
    render(<FeedView items={sampleItems} />);
    // a2 has hasPhoto:true but media:[] so placeholder renders
    expect(screen.getByTestId("photo-placeholder")).toBeInTheDocument();
  });

  it("does NOT render photo placeholder when hasPhoto is false and no media", () => {
    const noPhoto: FeedActivity[] = [{ ...sampleItems[0]!, hasPhoto: false, media: [] }];
    render(<FeedView items={noPhoto} />);
    expect(screen.queryByTestId("photo-placeholder")).toBeNull();
    expect(screen.queryByTestId("feed-photo")).toBeNull();
  });

  it("renders real img with signed URL when media has a URL", () => {
    const withMedia: FeedActivity[] = [
      {
        id: "a3",
        userHandle: "@carol",
        challengeTitle: "Yoga",
        dayKey: "2026-06-01",
        note: null,
        hasPhoto: true,
        cheerCount: 1,
        media: [
          {
            objectKey: "media/u1/photo.jpg",
            width: 800,
            height: 600,
            url: "https://minio.example.com/bucket/media/u1/photo.jpg?X-Amz-Signature=abc",
          },
        ],
      },
    ];
    render(<FeedView items={withMedia} />);
    const img = screen.getByTestId("feed-photo");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      "src",
      "https://minio.example.com/bucket/media/u1/photo.jpg?X-Amz-Signature=abc",
    );
    expect(img).toHaveAttribute("alt", "Activity photo by @carol");
    // No placeholder when real image is present
    expect(screen.queryByTestId("photo-placeholder")).toBeNull();
  });

  it("renders CheerButton for each item", () => {
    render(<FeedView items={sampleItems} />);
    const cheerButtons = screen.getAllByTestId("cheer-button");
    expect(cheerButtons).toHaveLength(2);
  });

  it("renders a 'Project 50 · Day N' badge for Project 50 items only", () => {
    const items: FeedActivity[] = [
      { ...sampleItems[0]!, id: "p1", isProject50: true, project50Day: 12 },
      { ...sampleItems[1]!, id: "p2", isProject50: false },
    ];
    render(<FeedView items={items} />);
    const badges = screen.getAllByTestId("project50-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("Project 50 · Day 12");
  });

  it("does not render the Project 50 badge when no items are Project 50", () => {
    render(<FeedView items={sampleItems} />);
    expect(screen.queryByTestId("project50-badge")).toBeNull();
  });

  it("renders no photo element when media is undefined and hasPhoto is false", () => {
    const item: FeedActivity = {
      id: "a4",
      userHandle: "@dave",
      challengeTitle: "Swim",
      dayKey: "2026-06-02",
      note: null,
      hasPhoto: false,
      cheerCount: 0,
    };
    render(<FeedView items={[item]} />);
    expect(screen.queryByTestId("feed-photo")).toBeNull();
    expect(screen.queryByTestId("photo-placeholder")).toBeNull();
  });
});
