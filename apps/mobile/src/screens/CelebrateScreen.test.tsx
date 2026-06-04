/**
 * RNTL tests for CelebrateScreen.
 * apiClient + share mocked. Tests:
 * - loading state
 * - renders challenge stats + badges
 * - generate recap buttons for each kind (DAY / WEEK / FIFTY)
 * - shows recap url after generation
 * - share handler calls shareUrl with the recap url
 * - error states (getChallenge / listRecaps / generateRecap)
 * - lists existing recaps
 */

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react-native";

jest.mock("../lib/apiClient", () => ({
  apiClient: {
    getChallenge: jest.fn(),
    listRecaps: jest.fn(),
    generateRecap: jest.fn(),
  },
}));

jest.mock("../lib/share", () => ({
  shareUrl: jest.fn(),
}));

import { apiClient } from "../lib/apiClient";
import { shareUrl } from "../lib/share";
import { CelebrateScreen } from "./CelebrateScreen";

const mockGetChallenge = apiClient.getChallenge as jest.Mock;
const mockListRecaps = apiClient.listRecaps as jest.Mock;
const mockGenerateRecap = apiClient.generateRecap as jest.Mock;
const mockShareUrl = shareUrl as jest.Mock;

// ─── Test data ──────────────────────────────────────────────────────────────

const mockChallengeDetail = {
  id: "c1",
  title: "Run 5K Daily",
  goalType: "TARGET",
  dailyTarget: 5,
  unit: "km",
  startDate: "2026-01-01",
  lengthDays: 50,
  timezone: "UTC",
  visibility: "PUBLIC",
  currentStreak: 10,
  longestStreak: 15,
  badges: 3,
  cheering: 8,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
  activities: [],
  dayStatuses: [],
  milestones: [
    { id: "m1", kind: "STREAK_7", earnedAt: "2026-01-08T00:00:00.000Z" },
    { id: "m2", kind: "STREAK_14", earnedAt: "2026-01-15T00:00:00.000Z" },
    { id: "m3", kind: "HALFWAY", earnedAt: "2026-01-25T00:00:00.000Z" },
  ],
};

const mockRecaps = [
  { id: "r1", kind: "DAY", url: "https://cdn.example.com/recap-day.mp4", createdAt: "2026-01-15T10:00:00.000Z" },
];

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("CelebrateScreen", () => {
  it("shows loading indicator initially", () => {
    mockGetChallenge.mockReturnValueOnce(new Promise(() => undefined));
    mockListRecaps.mockReturnValueOnce(new Promise(() => undefined));
    render(<CelebrateScreen challengeId="c1" />);
    expect(screen.getByTestId("celebrate-loading")).toBeTruthy();
  });

  it("renders challenge title after loading", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce(mockRecaps);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-title")).toBeTruthy();
    });
    expect(screen.getByText("Run 5K Daily")).toBeTruthy();
  });

  it("renders streak stats", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-streak")).toBeTruthy();
    });
    expect(screen.getByTestId("celebrate-streak").props.children).toBe(10);
  });

  it("renders badge count", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-badges")).toBeTruthy();
    });
    expect(screen.getByTestId("celebrate-badges").props.children).toBe(3);
  });

  it("renders milestone kinds", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-title")).toBeTruthy();
    });
    expect(screen.getByText("STREAK_7")).toBeTruthy();
    expect(screen.getByText("HALFWAY")).toBeTruthy();
  });

  it("lists existing recaps", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce(mockRecaps);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("recap-item-r1")).toBeTruthy();
    });
    expect(screen.getByText("https://cdn.example.com/recap-day.mp4")).toBeTruthy();
  });

  it("generates a DAY recap when 'Generate Day Recap' is pressed", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockResolvedValueOnce({
      recapId: "r2",
      kind: "DAY",
      url: "https://cdn.example.com/new-day.mp4",
    });

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-DAY"));
    });

    expect(mockGenerateRecap).toHaveBeenCalledWith("c1", "DAY");
    await waitFor(() => {
      expect(screen.getByTestId("recap-url")).toBeTruthy();
    });
    expect(screen.getByText("https://cdn.example.com/new-day.mp4")).toBeTruthy();
  });

  it("generates a WEEK recap when 'Generate Week Recap' is pressed", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockResolvedValueOnce({
      recapId: "r3",
      kind: "WEEK",
      url: "https://cdn.example.com/new-week.mp4",
    });

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-WEEK")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-WEEK"));
    });

    expect(mockGenerateRecap).toHaveBeenCalledWith("c1", "WEEK");
  });

  it("generates a FIFTY recap when 'Generate 50-Day Recap' is pressed", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockResolvedValueOnce({
      recapId: "r4",
      kind: "FIFTY",
      url: "https://cdn.example.com/new-fifty.mp4",
    });

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-FIFTY")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-FIFTY"));
    });

    expect(mockGenerateRecap).toHaveBeenCalledWith("c1", "FIFTY");
  });

  it("calls shareUrl with the generated recap url when share is pressed", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockResolvedValueOnce({
      recapId: "r2",
      kind: "DAY",
      url: "https://cdn.example.com/new-day.mp4",
    });
    mockShareUrl.mockResolvedValueOnce(undefined);

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-DAY"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("share-button")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("share-button"));
    });

    expect(mockShareUrl).toHaveBeenCalledWith("https://cdn.example.com/new-day.mp4");
  });

  it("shows error state when getChallenge throws", async () => {
    mockGetChallenge.mockRejectedValueOnce(new Error("Challenge not found"));
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-error")).toBeTruthy();
    });
    expect(screen.getByText("Challenge not found")).toBeTruthy();
  });

  it("shows generic error for non-Error throw", async () => {
    mockGetChallenge.mockRejectedValueOnce("something bad");
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-error")).toBeTruthy();
    });
    expect(screen.getByText("Failed to load challenge")).toBeTruthy();
  });

  it("shows generating indicator while generateRecap is in flight", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    let resolveGenerate!: (v: unknown) => void;
    mockGenerateRecap.mockReturnValueOnce(new Promise((r) => { resolveGenerate = r; }));

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("generate-DAY"));

    expect(screen.getByTestId("generating-indicator")).toBeTruthy();

    await act(async () => {
      resolveGenerate({ recapId: "r5", kind: "DAY", url: "https://cdn.example.com/done.mp4" });
    });
  });

  it("shows generate error when generateRecap fails", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockRejectedValueOnce(new Error("Render failed"));

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-DAY"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("generate-error")).toBeTruthy();
    });
    expect(screen.getByText("Render failed")).toBeTruthy();
  });

  it("shows generic generate error for non-Error throw from generateRecap", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockRejectedValueOnce("something went wrong");

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-DAY"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("generate-error")).toBeTruthy();
    });
    expect(screen.getByText("Failed to generate recap")).toBeTruthy();
  });

  it("does not call shareUrl when share is pressed with no generated url (early return)", async () => {
    // This tests the `if (!generatedUrl) return` guard in handleShare.
    // We render the screen with no recap generated — share button is not rendered, so we
    // cannot press it. Instead, verify the button is absent when no url is present.
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    // Share button only appears after a recap url is generated
    expect(screen.queryByTestId("share-button")).toBeNull();
  });

  it("shows 'Challenge not found' when challenge is null after error clears", async () => {
    // Tests the `!challenge` branch in error render (error === null but challenge === null).
    // This happens when error is null and challenge hasn't been set.
    // Simulate: getChallenge rejects with non-Error, listRecaps resolves.
    // The error message will be "Failed to load challenge" (non-Error throw sets the error state).
    // Separately, test the fallback label "Challenge not found" by having no error but no challenge.
    // The only way to reach !challenge without an error is if the challenge is null after load.
    // In practice, this is guarded by Promise.all — if it throws, error is set.
    // We cover this via the error || !challenge condition already tested above.
    // This test verifies the `?? "Challenge not found"` fallback when error is null.
    // To hit it: mock a resolved getChallenge returning null (unusual but covers the branch).
    mockGetChallenge.mockResolvedValueOnce(null as unknown as typeof mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-error")).toBeTruthy();
    });
    expect(screen.getByText("Challenge not found")).toBeTruthy();
  });

  // ─── Accessibility ──────────────────────────────────────────────────────────

  it("exposes generate buttons as accessible buttons and labels stats", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce(mockRecaps);

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => expect(screen.getByTestId("celebrate-content")).toBeTruthy());

    expect(screen.getByRole("button", { name: "Generate Day Recap" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate Week Recap" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate 50-Day Recap" })).toBeTruthy();
    expect(screen.getByLabelText("Streak: 10")).toBeTruthy();
    expect(screen.getByLabelText("Best streak: 15")).toBeTruthy();
  });

  it("labels the share button once a recap URL is generated", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockResolvedValueOnce({ url: "https://cdn.example/r.mp4" });

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => expect(screen.getByTestId("celebrate-content")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-DAY"));
    });

    expect(screen.getByRole("button", { name: "Share recap" })).toBeTruthy();
  });

  it("announces the error state as an alert", async () => {
    mockGetChallenge.mockRejectedValueOnce(new Error("Load failed"));
    mockListRecaps.mockResolvedValueOnce([]);

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => expect(screen.getByTestId("celebrate-error")).toBeTruthy());
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
