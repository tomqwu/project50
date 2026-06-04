/**
 * RNTL tests for DashboardScreen.
 * apiClient is mocked. Tests: loading state, empty state, renders challenge
 * title / day N/50 / streak, error state.
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react-native";

// Mock apiClient before imports
jest.mock("../lib/apiClient", () => ({
  apiClient: {
    listChallenges: jest.fn(),
    getChallenge: jest.fn(),
  },
}));

// Mock @project50/core's localDayKey for deterministic today
jest.mock("@project50/core", () => ({
  ...jest.requireActual("@project50/core"),
  localDayKey: jest.fn(() => "2026-01-15"),
}));

import { apiClient } from "../lib/apiClient";
import { DashboardScreen } from "./DashboardScreen";

const mockListChallenges = apiClient.listChallenges as jest.Mock;
const mockGetChallenge = apiClient.getChallenge as jest.Mock;

// ─── Test data ─────────────────────────────────────────────────────────────

const mockChallenge = {
  id: "c1",
  title: "Run 5K Daily",
  goalType: "TARGET" as const,
  dailyTarget: 5,
  unit: "km",
  startDate: "2026-01-01",
  lengthDays: 50,
  currentStreak: 3,
  longestStreak: 7,
  badges: 2,
  cheering: 5,
  visibility: "PUBLIC" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

const mockChallengeDetail = {
  ...mockChallenge,
  activities: [
    {
      id: "a1",
      challengeId: "c1",
      userId: "u1",
      dayKey: "2026-01-15",
      activityType: null,
      amount: 3,
      done: false,
      note: null,
      mood: null,
      createdAt: "2026-01-15T09:00:00.000Z",
      media: [],
    },
  ],
  dayStatuses: [
    { dayKey: "2026-01-13", completed: true, totalAmount: 5 },
    { dayKey: "2026-01-14", completed: true, totalAmount: 5 },
    { dayKey: "2026-01-15", completed: false, totalAmount: 3 },
  ],
  milestones: [],
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("DashboardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading indicator initially", () => {
    // Delay resolution so we can observe loading state
    mockListChallenges.mockReturnValueOnce(new Promise(() => undefined));
    render(<DashboardScreen />);
    expect(screen.getByTestId("dashboard-loading")).toBeTruthy();
  });

  it("renders challenge title after loading", async () => {
    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("challenge-title")).toBeTruthy();
    });
    expect(screen.getByText("Run 5K Daily")).toBeTruthy();
  });

  it("renders day N/50 correctly (day 15 of 50)", async () => {
    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("day-number")).toBeTruthy();
    });
    expect(screen.getByText("Day 15/50")).toBeTruthy();
  });

  it("renders streak value", async () => {
    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("current-streak")).toBeTruthy();
    });
    // Streak should be 0 since today (2026-01-15) is not completed in dayStatuses
    expect(screen.getByTestId("current-streak").props.children).toBe(0);
  });

  it("renders longest streak value", async () => {
    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("longest-streak")).toBeTruthy();
    });
    expect(screen.getByTestId("longest-streak").props.children).toBe(2);
  });

  it("shows loading state while fetching (async)", async () => {
    let resolveList!: (v: unknown) => void;
    mockListChallenges.mockReturnValueOnce(
      new Promise((r) => { resolveList = r; }),
    );

    render(<DashboardScreen />);
    expect(screen.getByTestId("dashboard-loading")).toBeTruthy();

    await act(async () => {
      resolveList([mockChallenge]);
      mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    });
  });

  it("shows empty state when no challenges", async () => {
    mockListChallenges.mockResolvedValueOnce([]);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-empty")).toBeTruthy();
    });
    expect(screen.getByText(/No challenges yet/)).toBeTruthy();
  });

  it("shows error state when listChallenges throws", async () => {
    mockListChallenges.mockRejectedValueOnce(new Error("Network error"));

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-error")).toBeTruthy();
    });
    expect(screen.getByText("Network error")).toBeTruthy();
  });

  it("shows error state when getChallenge throws", async () => {
    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockRejectedValueOnce(new Error("Challenge not found"));

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-error")).toBeTruthy();
    });
    expect(screen.getByText("Challenge not found")).toBeTruthy();
  });

  it("renders today progress text for TARGET challenge", async () => {
    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("today-progress")).toBeTruthy();
    });
    // 3 logged out of target 5 km
    expect(screen.getByText("3 / 5 km")).toBeTruthy();
  });

  it("shows Completed badge when today is done", async () => {
    const completedDetail = {
      ...mockChallengeDetail,
      activities: [
        {
          id: "a2",
          challengeId: "c1",
          userId: "u1",
          dayKey: "2026-01-15",
          activityType: null,
          amount: 5,
          done: false,
          note: null,
          mood: null,
          createdAt: "2026-01-15T09:00:00.000Z",
          media: [],
        },
      ],
      dayStatuses: [
        { dayKey: "2026-01-14", completed: true, totalAmount: 5 },
        { dayKey: "2026-01-15", completed: true, totalAmount: 5 },
      ],
    };

    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockResolvedValueOnce(completedDetail);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("today-completed")).toBeTruthy();
    });
    expect(screen.getByText("Completed!")).toBeTruthy();
  });

  it("renders BINARY challenge without amount text — not done", async () => {
    const binaryChallenge = {
      ...mockChallenge,
      id: "c2",
      title: "Meditate Daily",
      goalType: "BINARY" as const,
      dailyTarget: null,
      unit: null,
    };
    const binaryDetail = {
      ...binaryChallenge,
      activities: [],
      dayStatuses: [],
      milestones: [],
    };

    mockListChallenges.mockResolvedValueOnce([binaryChallenge]);
    mockGetChallenge.mockResolvedValueOnce(binaryDetail);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("today-progress")).toBeTruthy();
    });
    expect(screen.getByText("Not done yet")).toBeTruthy();
  });

  it("renders BINARY challenge showing Done! when today is completed", async () => {
    const binaryChallenge = {
      ...mockChallenge,
      id: "c2",
      title: "Meditate Daily",
      goalType: "BINARY" as const,
      dailyTarget: null,
      unit: null,
    };
    const binaryDetailDone = {
      ...binaryChallenge,
      activities: [
        {
          id: "a3",
          challengeId: "c2",
          userId: "u1",
          dayKey: "2026-01-15",
          activityType: null,
          amount: null,
          done: true,
          note: null,
          mood: null,
          createdAt: "2026-01-15T10:00:00.000Z",
          media: [],
        },
      ],
      dayStatuses: [{ dayKey: "2026-01-15", completed: true, totalAmount: 0 }],
      milestones: [],
    };

    mockListChallenges.mockResolvedValueOnce([binaryChallenge]);
    mockGetChallenge.mockResolvedValueOnce(binaryDetailDone);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("today-progress")).toBeTruthy();
    });
    expect(screen.getByText("Done!")).toBeTruthy();
  });

  it("handles activity with null amount (maps to undefined)", async () => {
    // Covers the a.amount ?? undefined branch in DashboardScreen
    const detailWithNullAmount = {
      ...mockChallengeDetail,
      activities: [
        {
          id: "a4",
          challengeId: "c1",
          userId: "u1",
          dayKey: "2026-01-15",
          activityType: null,
          amount: null, // null amount
          done: false,
          note: null,
          mood: null,
          createdAt: "2026-01-15T09:00:00.000Z",
          media: [],
        },
      ],
    };
    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockResolvedValueOnce(detailWithNullAmount);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("today-progress")).toBeTruthy();
    });
    // 0 logged (null amount mapped to undefined = 0 total)
    expect(screen.getByText("0 / 5 km")).toBeTruthy();
  });

  it("renders other challenges section when multiple challenges exist", async () => {
    const secondChallenge = {
      ...mockChallenge,
      id: "c3",
      title: "Read 30 Pages",
      goalType: "TARGET" as const,
      dailyTarget: 30,
      unit: "pages",
    };
    const detailWithOther = {
      ...mockChallengeDetail,
    };

    mockListChallenges.mockResolvedValueOnce([mockChallenge, secondChallenge]);
    mockGetChallenge.mockResolvedValueOnce(detailWithOther);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByText("Other Challenges")).toBeTruthy();
    });
    expect(screen.getByText("Read 30 Pages")).toBeTruthy();
  });

  it("shows generic error message for non-Error errors", async () => {
    mockListChallenges.mockRejectedValueOnce("something went wrong");

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-error")).toBeTruthy();
    });
    expect(screen.getByText("Failed to load dashboard")).toBeTruthy();
  });

  it("renders TARGET progress with null dailyTarget and null unit (uses fallback 0 and '')", async () => {
    const targetNoUnit = {
      ...mockChallenge,
      goalType: "TARGET" as const,
      dailyTarget: null,
      unit: null,
    };
    const detailNoUnit = {
      ...targetNoUnit,
      activities: [],
      dayStatuses: [],
      milestones: [],
    };

    mockListChallenges.mockResolvedValueOnce([targetNoUnit]);
    mockGetChallenge.mockResolvedValueOnce(detailNoUnit);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("today-progress")).toBeTruthy();
    });
    // Falls back to "0 / 0 " (empty unit string)
    expect(screen.getByText("0 / 0 ")).toBeTruthy();
  });

  // ─── Accessibility ──────────────────────────────────────────────────────────

  it("groups each stat with a descriptive accessibility label", async () => {
    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);

    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId("current-streak")).toBeTruthy());
    expect(screen.getByLabelText("Streak: 0")).toBeTruthy();
    expect(screen.getByLabelText("Best streak: 2")).toBeTruthy();
    expect(screen.getByLabelText(/^Badges: /)).toBeTruthy();
    expect(screen.getByLabelText(/^Cheers: /)).toBeTruthy();
  });

  it("marks the challenge title and section titles as headers", async () => {
    mockListChallenges.mockResolvedValueOnce([mockChallenge]);
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);

    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId("challenge-title")).toBeTruthy());
    const headers = screen.getAllByRole("header");
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  it("announces the error state as an alert", async () => {
    mockListChallenges.mockRejectedValueOnce(new Error("Network error"));

    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId("dashboard-error")).toBeTruthy());
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
