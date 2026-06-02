/**
 * RNTL tests for FeedScreen.
 * apiClient is mocked. Tests: loading state, empty state, renders feed items,
 * cheer button optimistic increment, revert on API failure, error state.
 */

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react-native";

jest.mock("../lib/apiClient", () => ({
  apiClient: {
    getFeed: jest.fn(),
    react: jest.fn(),
  },
}));

import { apiClient } from "../lib/apiClient";
import { FeedScreen } from "./FeedScreen";

const mockGetFeed = apiClient.getFeed as jest.Mock;
const mockReact = apiClient.react as jest.Mock;

// ─── Test data ──────────────────────────────────────────────────────────────

const makeFeedItem = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  challengeId: "c1",
  userId: "u1",
  dayKey: "2026-01-15",
  activityType: null,
  amount: null,
  done: true,
  note: "Felt great!",
  mood: 5,
  createdAt: "2026-01-15T09:00:00.000Z",
  media: [],
  challenge: {
    id: "c1",
    title: "Run 5K Daily",
    goalType: "BINARY",
    dailyTarget: null,
    unit: null,
    startDate: "2026-01-01",
    lengthDays: 50,
    timezone: "UTC",
    visibility: "PUBLIC",
    currentStreak: 5,
    longestStreak: 10,
    badges: 2,
    cheering: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
  },
  cheerCount: 3,
  hasPhoto: false,
  userHandle: "alice",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("FeedScreen", () => {
  it("shows loading indicator initially", () => {
    mockGetFeed.mockReturnValueOnce(new Promise(() => undefined));
    render(<FeedScreen />);
    expect(screen.getByTestId("feed-loading")).toBeTruthy();
  });

  it("shows empty state when feed is empty", async () => {
    mockGetFeed.mockResolvedValueOnce([]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-empty")).toBeTruthy();
    });
    expect(screen.getByText(/No activity yet/i)).toBeTruthy();
  });

  it("renders feed items after loading", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1"), makeFeedItem("a2")]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-list")).toBeTruthy();
    });
    expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    expect(screen.getByTestId("feed-item-a2")).toBeTruthy();
  });

  it("renders challenge title in each feed card", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1")]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    });
    expect(screen.getByText("Run 5K Daily")).toBeTruthy();
  });

  it("renders day key in feed card", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1")]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    });
    expect(screen.getByText(/2026-01-15/)).toBeTruthy();
  });

  it("renders note text in feed card", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1")]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    });
    expect(screen.getByText("Felt great!")).toBeTruthy();
  });

  it("renders cheer count for an item", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1", { cheerCount: 7 })]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("cheer-count-a1")).toBeTruthy();
    });
    expect(screen.getByTestId("cheer-count-a1").props.children).toBe(7);
  });

  it("optimistically increments cheer count on cheer button press", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1", { cheerCount: 3 })]);
    mockReact.mockResolvedValueOnce({ id: "r1", activityId: "a1", userId: "u1", kind: "CHEER", text: null, createdAt: "" });

    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("cheer-button-a1")).toBeTruthy();
    });

    // Before cheer: count is 3
    expect(screen.getByTestId("cheer-count-a1").props.children).toBe(3);

    fireEvent.press(screen.getByTestId("cheer-button-a1"));

    // Optimistic: immediately shows 4
    expect(screen.getByTestId("cheer-count-a1").props.children).toBe(4);

    // After API resolves: still 4
    await waitFor(() => {
      expect(mockReact).toHaveBeenCalledWith("a1", "CHEER");
    });
    expect(screen.getByTestId("cheer-count-a1").props.children).toBe(4);
  });

  it("reverts cheer count on API failure", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1", { cheerCount: 3 })]);
    mockReact.mockRejectedValueOnce(new Error("Network error"));

    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("cheer-button-a1")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("cheer-button-a1"));
      // Wait for the rejection to be handled
    });

    await waitFor(() => {
      expect(screen.getByTestId("cheer-count-a1").props.children).toBe(3);
    });
  });

  it("shows error state when getFeed throws", async () => {
    mockGetFeed.mockRejectedValueOnce(new Error("Feed unavailable"));
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-error")).toBeTruthy();
    });
    expect(screen.getByText("Feed unavailable")).toBeTruthy();
  });

  it("shows generic error for non-Error throw", async () => {
    mockGetFeed.mockRejectedValueOnce("oops");
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-error")).toBeTruthy();
    });
    expect(screen.getByText("Failed to load feed")).toBeTruthy();
  });

  it("renders photo image when item has media", async () => {
    const itemWithPhoto = makeFeedItem("a1", {
      hasPhoto: true,
      media: [{ objectKey: "key/photo.jpg", url: "https://cdn.example.com/photo.jpg", width: 800, height: 600, order: 0 }],
    });
    mockGetFeed.mockResolvedValueOnce([itemWithPhoto]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-photo-a1")).toBeTruthy();
    });
    expect(screen.getByTestId("feed-photo-a1").props.source.uri).toBe("https://cdn.example.com/photo.jpg");
  });

  it("does not render photo when item has no media", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1", { media: [] })]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    });
    expect(screen.queryByTestId("feed-photo-a1")).toBeNull();
  });

  it("does not render note when item.note is null", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1", { note: null })]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    });
    expect(screen.queryByText("Felt great!")).toBeNull();
  });

  it("cheer optimistic update only increments the pressed item, not others", async () => {
    mockGetFeed.mockResolvedValueOnce([
      makeFeedItem("a1", { cheerCount: 3 }),
      makeFeedItem("a2", { cheerCount: 10 }),
    ]);
    mockReact.mockResolvedValueOnce({ id: "r1", activityId: "a1", userId: "u1", kind: "CHEER", text: null, createdAt: "" });

    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("cheer-button-a1")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("cheer-button-a1"));

    // a1 increments, a2 stays at 10
    expect(screen.getByTestId("cheer-count-a1").props.children).toBe(4);
    expect(screen.getByTestId("cheer-count-a2").props.children).toBe(10);
  });

  it("cheer revert only decrements the failed item, not others", async () => {
    mockGetFeed.mockResolvedValueOnce([
      makeFeedItem("a1", { cheerCount: 3 }),
      makeFeedItem("a2", { cheerCount: 10 }),
    ]);
    mockReact.mockRejectedValueOnce(new Error("Network error"));

    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("cheer-button-a1")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("cheer-button-a1"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("cheer-count-a1").props.children).toBe(3);
    });
    // a2 is not affected
    expect(screen.getByTestId("cheer-count-a2").props.children).toBe(10);
  });
});
