import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Project50State } from "@/lib/project50";

// ---- hoisted mocks ----
const { mockRequireUser, mockGetProject50State, mockStartAction, mockToggleAction } = vi.hoisted(
  () => ({
    mockRequireUser: vi.fn<() => Promise<string>>(),
    mockGetProject50State: vi.fn<() => Promise<Project50State>>(),
    mockStartAction: vi.fn(),
    mockToggleAction: vi.fn(),
  }),
);

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
// Mock the prisma-importing state module so the real module isn't loaded.
vi.mock("@/lib/project50", () => ({ getProject50State: mockGetProject50State }));
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
});
