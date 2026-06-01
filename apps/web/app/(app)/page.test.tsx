import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ---- hoisted mocks ----
const { mockRequireUser, mockListChallenges, mockGetChallenge, mockLocalDayKey, mockDayNumber } =
  vi.hoisted(() => ({
    mockRequireUser: vi.fn<() => Promise<string>>(),
    mockListChallenges: vi.fn(),
    mockGetChallenge: vi.fn(),
    mockLocalDayKey: vi.fn(),
    mockDayNumber: vi.fn(),
  }));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/challenges", () => ({
  listChallenges: mockListChallenges,
  getChallenge: mockGetChallenge,
}));
vi.mock("@project50/core", () => ({
  localDayKey: mockLocalDayKey,
  dayNumber: mockDayNumber,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import DashboardPage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const sampleChallenge = {
  id: "c1",
  title: "Run 5K",
  goalType: "TARGET",
  unit: "km",
  startDate: "2026-05-01",
  dailyTarget: 5,
  timezone: "UTC",
  dayStatuses: [
    { dayKey: "2026-06-01", totalAmount: 3, completed: false },
  ],
  currentStreak: 7,
  longestStreak: 10,
};

describe("DashboardPage", () => {
  it("renders empty state when no challenges", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockListChallenges.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByText(/No active challenges yet/)).toBeInTheDocument();
  });

  it("renders primary challenge with data", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockListChallenges.mockResolvedValue([{ id: "c1", title: "Run 5K", goalType: "TARGET" }]);
    mockGetChallenge.mockResolvedValue(sampleChallenge);
    mockLocalDayKey.mockReturnValue("2026-06-01");
    mockDayNumber.mockReturnValue(32);

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText("Run 5K")).toBeInTheDocument();
    expect(screen.getByTestId("day-number")).toHaveTextContent("Day 32 / 50");
    // Ring label: 3 / 5 km
    expect(screen.getByRole("img", { name: /3 \/ 5/ })).toBeInTheDocument();
    // Streak stat
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders with no today dayStatus (today is null)", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockListChallenges.mockResolvedValue([{ id: "c1", title: "Run 5K", goalType: "TARGET" }]);
    const noTodayCh = { ...sampleChallenge, dayStatuses: [] };
    mockGetChallenge.mockResolvedValue(noTodayCh);
    mockLocalDayKey.mockReturnValue("2026-06-01");
    mockDayNumber.mockReturnValue(1);

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText("Run 5K")).toBeInTheDocument();
    // When today is null, DashboardView uses target=1 fallback → "0 / 1 km"
    expect(screen.getByRole("img", { name: /0 \/ 1/ })).toBeInTheDocument();
  });

  it("renders multiple challenges — shows other challenges section", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockListChallenges.mockResolvedValue([
      { id: "c1", title: "Run 5K", goalType: "TARGET" },
      { id: "c2", title: "Yoga", goalType: "BINARY" },
    ]);
    mockGetChallenge.mockResolvedValue(sampleChallenge);
    mockLocalDayKey.mockReturnValue("2026-06-01");
    mockDayNumber.mockReturnValue(12);

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText("Yoga")).toBeInTheDocument();
    expect(screen.getByText("Other challenges")).toBeInTheDocument();
  });

  it("falls back to UTC timezone when timezone is null", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockListChallenges.mockResolvedValue([{ id: "c1", title: "Run 5K", goalType: "TARGET" }]);
    const noTzCh = { ...sampleChallenge, timezone: null };
    mockGetChallenge.mockResolvedValue(noTzCh);
    mockLocalDayKey.mockReturnValue("2026-06-01");
    mockDayNumber.mockReturnValue(1);

    const ui = await DashboardPage();
    render(ui);

    // localDayKey should have been called with "UTC"
    expect(mockLocalDayKey).toHaveBeenCalledWith(expect.any(Date), "UTC");
    expect(screen.getByText("Run 5K")).toBeInTheDocument();
  });

  it("handles null totalAmount and dailyTarget in todayStatus", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockListChallenges.mockResolvedValue([{ id: "c1", title: "Run 5K", goalType: "TARGET" }]);
    const nullAmountCh = {
      ...sampleChallenge,
      dailyTarget: null,
      unit: null,
      dayStatuses: [{ dayKey: "2026-06-01", totalAmount: null, completed: false }],
    };
    mockGetChallenge.mockResolvedValue(nullAmountCh);
    mockLocalDayKey.mockReturnValue("2026-06-01");
    mockDayNumber.mockReturnValue(1);

    const ui = await DashboardPage();
    render(ui);

    // totalAmount=null→0, dailyTarget=null→1; ring label "0 / 1"
    expect(screen.getByRole("img", { name: /0 \/ 1/ })).toBeInTheDocument();
  });
});
