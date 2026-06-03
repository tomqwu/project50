import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Project50State } from "@/lib/project50";

// ---- hoisted mocks ----
const {
  mockRequireUser,
  mockGetProject50State,
  mockStartAction,
  mockToggleAction,
  mockListChallenges,
  mockGetChallenge,
  mockLocalDayKey,
  mockDayNumber,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockGetProject50State: vi.fn<() => Promise<Project50State>>(),
  mockStartAction: vi.fn(),
  mockToggleAction: vi.fn(),
  mockListChallenges: vi.fn(),
  mockGetChallenge: vi.fn(),
  mockLocalDayKey: vi.fn(),
  mockDayNumber: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
// Mock the prisma-importing state module so the real module isn't loaded.
vi.mock("@/lib/project50", () => ({ getProject50State: mockGetProject50State }));
vi.mock("@/lib/api/challenges", () => ({
  listChallenges: mockListChallenges,
  getChallenge: mockGetChallenge,
}));
// Partial mock so PROJECT50_RULES (needed by Project50View) is preserved.
vi.mock("@project50/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@project50/core")>()),
  localDayKey: mockLocalDayKey,
  dayNumber: mockDayNumber,
}));
// Mock the server actions module (same specifier the client imports) so importing
// Project50Client doesn't pull in server-only deps.
vi.mock("./_actions/project50", () => ({
  startProject50Action: mockStartAction,
  toggleRuleAction: mockToggleAction,
}));
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

import DashboardPage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("DashboardPage (Project 50)", () => {
  it("NONE → renders the Start Project 50 button and the custom-plan link", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({ status: "NONE" });
    mockListChallenges.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByRole("button", { name: /start project 50/i })).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/challenges/new");
  });

  it("ACTIVE → renders the Day n / 50 header", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({
      status: "ACTIVE",
      runId: "r1",
      today: {
        dayKey: "2026-06-02",
        dayNumber: 3,
        checks: [false, false, false, false, false, false, false],
        completedCount: 0,
      },
    });

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText(/Day 3 \/ 50/)).toBeInTheDocument();
  });

  it("FAILED → renders Streak broken and a Start over button", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({
      status: "FAILED",
      failedDayNumber: 12,
      failedRuleId: 3,
    });

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText(/Streak broken/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start over/i })).toBeInTheDocument();
  });

  it("COMPLETED → renders the celebration screen", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({
      status: "COMPLETED",
      runId: "r1",
      completedDays: 50,
    });

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText(/finished project 50/i)).toBeInTheDocument();
  });

  it("ACTIVE → clicking a rule row invokes toggleRuleAction(ruleId, true)", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({
      status: "ACTIVE",
      runId: "r1",
      today: {
        dayKey: "2026-06-02",
        dayNumber: 3,
        checks: [false, false, false, false, false, false, false],
        completedCount: 0,
      },
    });

    const ui = await DashboardPage();
    render(ui);

    fireEvent.click(screen.getByTestId("rule-row-1"));
    expect(mockToggleAction).toHaveBeenCalledWith(1, true);
  });

  it("NONE → clicking Start Project 50 invokes startProject50Action", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({ status: "NONE" });
    mockListChallenges.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);

    fireEvent.click(screen.getByRole("button", { name: /start project 50/i }));
    expect(mockStartAction).toHaveBeenCalledTimes(1);
  });

  it("FAILED → clicking Start over invokes startProject50Action (restart)", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({
      status: "FAILED",
      failedDayNumber: 12,
      failedRuleId: 3,
    });

    const ui = await DashboardPage();
    render(ui);

    fireEvent.click(screen.getByRole("button", { name: /start over/i }));
    expect(mockStartAction).toHaveBeenCalledTimes(1);
  });

  // ---- NONE + has challenges → adaptive dashboard ----
  const sampleChallenge = {
    id: "c1",
    title: "Run 5K",
    goalType: "TARGET",
    unit: "km",
    startDate: "2026-05-01",
    dailyTarget: 5,
    timezone: "UTC",
    dayStatuses: [{ dayKey: "2026-06-01", totalAmount: 3, completed: false }],
    currentStreak: 7,
    badges: 3,
    cheering: 12,
  };

  it("NONE + has challenges → renders DashboardView and a Start Project 50 entry", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({ status: "NONE" });
    mockListChallenges.mockResolvedValue([{ id: "c1", title: "Run 5K", goalType: "TARGET" }]);
    mockGetChallenge.mockResolvedValue(sampleChallenge);
    mockLocalDayKey.mockReturnValue("2026-06-01");
    mockDayNumber.mockReturnValue(32);

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText("Run 5K")).toBeInTheDocument();
    expect(screen.getByTestId("day-number")).toHaveTextContent("Day 32 / 50");
    expect(screen.getByRole("button", { name: /start project 50/i })).toBeInTheDocument();
  });

  it("NONE + has challenges → clicking Start Project 50 invokes startProject50Action", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({ status: "NONE" });
    mockListChallenges.mockResolvedValue([{ id: "c1", title: "Run 5K", goalType: "TARGET" }]);
    mockGetChallenge.mockResolvedValue(sampleChallenge);
    mockLocalDayKey.mockReturnValue("2026-06-01");
    mockDayNumber.mockReturnValue(32);

    const ui = await DashboardPage();
    render(ui);

    fireEvent.click(screen.getByRole("button", { name: /start project 50/i }));
    expect(mockStartAction).toHaveBeenCalledTimes(1);
  });

  it("NONE + has challenges → no today dayStatus falls back to 0 / 1 ring, null timezone → UTC", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({ status: "NONE" });
    mockListChallenges.mockResolvedValue([{ id: "c1", title: "Run 5K", goalType: "TARGET" }]);
    mockGetChallenge.mockResolvedValue({
      ...sampleChallenge,
      timezone: null,
      dailyTarget: 1,
      dayStatuses: [],
    });
    mockLocalDayKey.mockReturnValue("2026-06-01");
    mockDayNumber.mockReturnValue(0);

    const ui = await DashboardPage();
    render(ui);

    expect(mockLocalDayKey).toHaveBeenCalledWith(expect.any(Date), "UTC");
    // today is null → ring fallback "0 / 1"; dayNumber 0 → Math.max(1, 0) = 1
    expect(screen.getByRole("img", { name: /0 \/ 1/ })).toBeInTheDocument();
    expect(screen.getByTestId("day-number")).toHaveTextContent("Day 1 / 50");
  });

  it("NONE + has challenges → null totalAmount/dailyTarget/unit fall back (0 / 1)", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetProject50State.mockResolvedValue({ status: "NONE" });
    mockListChallenges.mockResolvedValue([{ id: "c1", title: "Run 5K", goalType: "TARGET" }]);
    mockGetChallenge.mockResolvedValue({
      ...sampleChallenge,
      dailyTarget: null,
      unit: null,
      dayStatuses: [{ dayKey: "2026-06-01", totalAmount: null, completed: false }],
    });
    mockLocalDayKey.mockReturnValue("2026-06-01");
    mockDayNumber.mockReturnValue(1);

    const ui = await DashboardPage();
    render(ui);

    // totalAmount null→0, dailyTarget null→1, unit null→""; ring label "0 / 1"
    expect(screen.getByRole("img", { name: /0 \/ 1/ })).toBeInTheDocument();
  });
});
