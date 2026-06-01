import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockGetChallengeByShareId, mockNotFound, mockDayNumber } = vi.hoisted(() => ({
  mockGetChallengeByShareId: vi.fn(),
  mockNotFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  mockDayNumber: vi.fn(),
}));

vi.mock("@/lib/api/challenges", () => ({
  getChallengeByShareId: mockGetChallengeByShareId,
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

vi.mock("@project50/core", () => ({
  dayNumber: mockDayNumber,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    style,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
    [key: string]: unknown;
  }) => (
    <a href={href} style={style} {...rest}>
      {children}
    </a>
  ),
}));

import PublicSharePage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const publicChallenge = {
  id: "c1",
  title: "Run 5K",
  goalType: "TARGET",
  unit: "km",
  dailyTarget: 5,
  startDate: "2026-06-01",
  lengthDays: 50,
  timezone: "UTC",
  visibility: "PUBLIC",
  shareId: "share-abc",
  dayStatuses: [
    { dayKey: "2026-06-01", totalAmount: 5, completed: true },
    { dayKey: "2026-06-02", totalAmount: 3, completed: false },
  ],
  milestones: [{ kind: "COMPLETED_7" }],
};

describe("PublicSharePage", () => {
  it("calls notFound when challenge is null", async () => {
    mockGetChallengeByShareId.mockResolvedValue(null);

    await expect(
      PublicSharePage({ params: Promise.resolve({ shareId: "nonexistent" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalled();
  });

  it("renders the CelebrateView for a public challenge", async () => {
    mockGetChallengeByShareId.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(25);

    const ui = await PublicSharePage({ params: Promise.resolve({ shareId: "share-abc" }) });
    render(ui);

    // CelebrateView content
    expect(screen.getByText("Milestone reached")).toBeInTheDocument();
    expect(screen.getByTestId("celebrate-title")).toHaveTextContent("Run 5K");
    expect(screen.getByText("Days done")).toBeInTheDocument();
  });

  it("renders the project50 wordmark", async () => {
    mockGetChallengeByShareId.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(25);

    const ui = await PublicSharePage({ params: Promise.resolve({ shareId: "share-abc" }) });
    render(ui);

    expect(screen.getByTestId("wordmark")).toHaveTextContent("project50");
  });

  it("renders the 'Start your own' link to /signin", async () => {
    mockGetChallengeByShareId.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(25);

    const ui = await PublicSharePage({ params: Promise.resolve({ shareId: "share-abc" }) });
    render(ui);

    const link = screen.getByTestId("start-own-link");
    expect(link).toHaveAttribute("href", "/signin");
    expect(link).toHaveTextContent("Start your own");
  });

  it("shows badge when milestone is present", async () => {
    mockGetChallengeByShareId.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(25);

    const ui = await PublicSharePage({ params: Promise.resolve({ shareId: "share-abc" }) });
    render(ui);

    expect(screen.getByTestId("badge-COMPLETED_7")).toBeInTheDocument();
  });

  it("handles BINARY challenge with null totalAmount", async () => {
    const binaryChallenge = {
      ...publicChallenge,
      goalType: "BINARY",
      unit: null,
      dailyTarget: null,
    };
    mockGetChallengeByShareId.mockResolvedValue(binaryChallenge);
    mockDayNumber.mockReturnValue(10);

    const ui = await PublicSharePage({ params: Promise.resolve({ shareId: "share-abc" }) });
    render(ui);

    expect(screen.queryByText("Total")).toBeNull();
  });

  it("falls back to UTC when timezone is null", async () => {
    const noTzChallenge = { ...publicChallenge, timezone: null };
    mockGetChallengeByShareId.mockResolvedValue(noTzChallenge);
    mockDayNumber.mockReturnValue(10);

    const ui = await PublicSharePage({ params: Promise.resolve({ shareId: "share-abc" }) });
    render(ui);

    // Should render without error
    expect(screen.getByTestId("wordmark")).toBeInTheDocument();
  });

  it("clamps dayNumber to at least 1", async () => {
    mockGetChallengeByShareId.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(-3); // negative

    const ui = await PublicSharePage({ params: Promise.resolve({ shareId: "share-abc" }) });
    render(ui);

    expect(screen.getByText("Day 1 / 50")).toBeInTheDocument();
  });

  it("renders null totalAmount completed days correctly", async () => {
    const nullAmtChallenge = {
      ...publicChallenge,
      dayStatuses: [
        { dayKey: "2026-06-01", totalAmount: null, completed: true },
        { dayKey: "2026-06-02", totalAmount: 5, completed: true },
      ],
    };
    mockGetChallengeByShareId.mockResolvedValue(nullAmtChallenge);
    mockDayNumber.mockReturnValue(10);

    const ui = await PublicSharePage({ params: Promise.resolve({ shareId: "share-abc" }) });
    render(ui);

    // totalAmount = null→0 + 5 = 5, daysCompleted = 2
    expect(screen.getByText("2")).toBeInTheDocument(); // days completed
  });
});
