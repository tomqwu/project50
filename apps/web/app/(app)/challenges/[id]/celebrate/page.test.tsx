import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockRequireUser, mockGetChallenge, mockGetMilestones, mockLocalDayKey, mockDayNumber } =
  vi.hoisted(() => ({
    mockRequireUser: vi.fn<() => Promise<string>>(),
    mockGetChallenge: vi.fn(),
    mockGetMilestones: vi.fn(),
    mockLocalDayKey: vi.fn(),
    mockDayNumber: vi.fn(),
  }));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/challenges", () => ({
  getChallenge: mockGetChallenge,
  getMilestones: mockGetMilestones,
}));
vi.mock("@project50/core", () => ({
  localDayKey: mockLocalDayKey,
  dayNumber: mockDayNumber,
}));
vi.mock("./ShareActions", () => ({
  ShareActions: ({ challengeId, shareId, visibility }: { challengeId: string; shareId: string; visibility: string }) => (
    <div data-testid="share-actions" data-challenge-id={challengeId} data-share-id={shareId} data-visibility={visibility} />
  ),
}));

import CelebratePage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const baseChallenge = {
  id: "c1",
  title: "Run 5K",
  goalType: "TARGET",
  unit: "km",
  startDate: "2026-05-01",
  dailyTarget: 5,
  timezone: "UTC",
  visibility: "PUBLIC",
  shareId: "share-abc123",
  dayStatuses: [
    { dayKey: "2026-05-01", totalAmount: 5, completed: true },
    { dayKey: "2026-05-02", totalAmount: 3, completed: false },
    { dayKey: "2026-05-03", totalAmount: 5, completed: true },
  ],
  activities: [],
  currentStreak: 0,
  longestStreak: 0,
};

describe("CelebratePage", () => {
  it("renders CelebrateView for in-progress challenge (day < 50)", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(baseChallenge);
    mockGetMilestones.mockResolvedValue([]);
    mockLocalDayKey.mockReturnValue("2026-05-03");
    mockDayNumber.mockReturnValue(3);

    const ui = await CelebratePage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.getByText("Milestone reached")).toBeInTheDocument();
    // 2 completed dayStatuses
    expect(screen.getByText("Days done")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // totalAmount = 5 + 5 = 10
    expect(screen.getByText("10 km")).toBeInTheDocument();
  });

  it("passes shareActions with correct challengeId, shareId, visibility to CelebrateView", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(baseChallenge);
    mockGetMilestones.mockResolvedValue([]);
    mockLocalDayKey.mockReturnValue("2026-05-03");
    mockDayNumber.mockReturnValue(3);

    const ui = await CelebratePage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    const sa = screen.getByTestId("share-actions");
    expect(sa).toHaveAttribute("data-challenge-id", "c1");
    expect(sa).toHaveAttribute("data-share-id", "share-abc123");
    expect(sa).toHaveAttribute("data-visibility", "PUBLIC");
  });

  it("renders CelebrateView for day-50 complete", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(baseChallenge);
    mockGetMilestones.mockResolvedValue([
      { kind: "COMPLETED_7" },
      { kind: "STREAK_7" },
    ]);
    mockLocalDayKey.mockReturnValue("2026-06-19");
    mockDayNumber.mockReturnValue(50);

    const ui = await CelebratePage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.getByTestId("celebrate-title")).toHaveTextContent("Day 50 complete");
    expect(screen.getByTestId("badge-COMPLETED_7")).toBeInTheDocument();
  });

  it("renders BINARY challenge with null totalAmount", async () => {
    const binaryCh = {
      ...baseChallenge,
      goalType: "BINARY",
      unit: null,
      dailyTarget: null,
    };
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(binaryCh);
    mockGetMilestones.mockResolvedValue([]);
    mockLocalDayKey.mockReturnValue("2026-05-03");
    mockDayNumber.mockReturnValue(3);

    const ui = await CelebratePage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    // For BINARY, totalAmount is null → no Total stat
    expect(screen.queryByText("Total")).toBeNull();
  });

  it("falls back to UTC when timezone is null", async () => {
    const noTzCh = { ...baseChallenge, timezone: null };
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(noTzCh);
    mockGetMilestones.mockResolvedValue([]);
    mockLocalDayKey.mockReturnValue("2026-05-03");
    mockDayNumber.mockReturnValue(3);

    const ui = await CelebratePage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(mockLocalDayKey).toHaveBeenCalledWith(expect.any(Date), "UTC");
  });

  it("uses unit null when challenge has no unit", async () => {
    const noUnitCh = { ...baseChallenge, unit: null };
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(noUnitCh);
    mockGetMilestones.mockResolvedValue([]);
    mockLocalDayKey.mockReturnValue("2026-05-03");
    mockDayNumber.mockReturnValue(3);

    const ui = await CelebratePage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    // totalAmount=10, no unit → "10"
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("handles null totalAmount in completed dayStatuses (TARGET)", async () => {
    const nullAmtCh = {
      ...baseChallenge,
      dayStatuses: [
        { dayKey: "2026-05-01", totalAmount: null, completed: true },
        { dayKey: "2026-05-02", totalAmount: 5, completed: true },
      ],
    };
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(nullAmtCh);
    mockGetMilestones.mockResolvedValue([]);
    mockLocalDayKey.mockReturnValue("2026-05-03");
    mockDayNumber.mockReturnValue(3);

    const ui = await CelebratePage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    // null→0 + 5 = 5
    expect(screen.getByText("5 km")).toBeInTheDocument();
  });

  it("passes photoUrl from most recent activity with media", async () => {
    const signedUrl = "https://minio.example.com/bucket/media/u1/photo.jpg?sig=abc";
    const withPhotoCh = {
      ...baseChallenge,
      activities: [
        {
          id: "act1",
          media: [{ objectKey: "media/u1/photo.jpg", width: 800, height: 600, url: signedUrl }],
        },
      ],
    };
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(withPhotoCh);
    mockGetMilestones.mockResolvedValue([]);
    mockLocalDayKey.mockReturnValue("2026-05-03");
    mockDayNumber.mockReturnValue(3);

    const ui = await CelebratePage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    const img = screen.getByTestId("celebrate-photo");
    expect(img).toHaveAttribute("src", signedUrl);
  });

  it("passes null photoUrl when no activities have media", async () => {
    const noPhotoCh = {
      ...baseChallenge,
      activities: [
        { id: "act1", media: [] },
        { id: "act2", media: [] },
      ],
    };
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(noPhotoCh);
    mockGetMilestones.mockResolvedValue([]);
    mockLocalDayKey.mockReturnValue("2026-05-03");
    mockDayNumber.mockReturnValue(3);

    const ui = await CelebratePage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.queryByTestId("celebrate-photo")).toBeNull();
  });
});
