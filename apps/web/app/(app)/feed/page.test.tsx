import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockRequireUser, mockFeed } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockFeed: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/social", () => ({ feed: mockFeed }));
vi.mock("./_components/FeedView", () => ({
  FeedView: ({ items }: { items: Array<{ id: string }> }) => (
    <div data-testid="feed-view" data-item-count={items.length} />
  ),
}));

import FeedPage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("FeedPage", () => {
  it("renders FeedView with empty items when feed is empty", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockFeed.mockResolvedValue([]);

    const ui = await FeedPage();
    render(ui);

    expect(screen.getByTestId("feed-view")).toHaveAttribute("data-item-count", "0");
  });

  it("maps feed activities to FeedActivity items", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockFeed.mockResolvedValue([
      {
        id: "a1",
        user: { handle: "alice" },
        challenge: { title: "Run 5K" },
        dayKey: "2026-06-01",
        note: "Good run",
      },
      {
        id: "a2",
        user: { handle: "bob" },
        challenge: { title: "Yoga" },
        dayKey: "2026-06-01",
        note: null,
      },
    ]);

    const ui = await FeedPage();
    render(ui);

    expect(screen.getByTestId("feed-view")).toHaveAttribute("data-item-count", "2");
  });
});
