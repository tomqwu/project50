import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { FeedActivity } from "./_components/FeedView";

const { mockRequireUser, mockFeed } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockFeed: vi.fn(),
}));

let capturedItems: FeedActivity[] = [];

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/social", () => ({ feed: mockFeed }));
vi.mock("./_components/FeedView", () => ({
  FeedView: ({ items }: { items: FeedActivity[] }) => {
    capturedItems = items;
    return <div data-testid="feed-view" data-item-count={items.length} />;
  },
}));

import FeedPage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  capturedItems = [];
});

describe("FeedPage", () => {
  it("renders FeedView with empty items when feed is empty", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockFeed.mockResolvedValue([]);

    const ui = await FeedPage();
    render(ui);

    expect(screen.getByTestId("feed-view")).toHaveAttribute("data-item-count", "0");
  });

  it("maps feed activities to FeedActivity items with real cheerCount and hasPhoto", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockFeed.mockResolvedValue([
      {
        id: "a1",
        user: { handle: "alice" },
        challenge: { title: "Run 5K" },
        dayKey: "2026-06-01",
        note: "Good run",
        cheerCount: 5,
        hasPhoto: true,
        isProject50: true,
        project50Day: 1,
        media: [
          { objectKey: "media/u1/p.png", width: 100, height: 80, url: "https://signed-get/p.png" },
        ],
      },
      {
        id: "a2",
        user: { handle: "bob" },
        challenge: { title: "Yoga" },
        dayKey: "2026-06-01",
        note: null,
        cheerCount: 0,
        hasPhoto: false,
        isProject50: false,
        project50Day: undefined,
        media: [],
      },
    ]);

    const ui = await FeedPage();
    render(ui);

    expect(screen.getByTestId("feed-view")).toHaveAttribute("data-item-count", "2");
    expect(capturedItems[0]!.cheerCount).toBe(5);
    expect(capturedItems[0]!.hasPhoto).toBe(true);
    expect(capturedItems[1]!.cheerCount).toBe(0);
    expect(capturedItems[1]!.hasPhoto).toBe(false);
    expect(capturedItems[0]!.isProject50).toBe(true);
    expect(capturedItems[0]!.project50Day).toBe(1);
    expect(capturedItems[1]!.isProject50).toBe(false);
    expect(capturedItems[0]!.userHandle).toBe("@alice");
    expect(capturedItems[0]!.challengeTitle).toBe("Run 5K");
    expect(capturedItems[0]!.note).toBe("Good run");
    // The media map callback runs for the non-empty media array.
    expect(capturedItems[0]!.media).toEqual([
      { objectKey: "media/u1/p.png", width: 100, height: 80, url: "https://signed-get/p.png" },
    ]);
    // Empty media array maps to an empty array.
    expect(capturedItems[1]!.media).toEqual([]);
  });
});
