import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockRequireUser, mockGetChallenge, mockPush } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockGetChallenge: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/challenges", () => ({ getChallenge: mockGetChallenge }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

globalThis.fetch = vi.fn();

import LogActivityPage from "./page";

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
  dayStatuses: [],
  currentStreak: 0,
  longestStreak: 0,
};

describe("LogActivityPage", () => {
  it("renders the form with correct props for TARGET challenge", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue(sampleChallenge);

    const ui = await LogActivityPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    // Should show amount input (TARGET) with unit label
    expect(screen.getByTestId("amount-input")).toBeInTheDocument();
    expect(screen.getByText("Amount (km)")).toBeInTheDocument();
  });

  it("renders the form with done toggle for BINARY challenge", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue({ ...sampleChallenge, goalType: "BINARY", unit: null });

    const ui = await LogActivityPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.getByTestId("done-toggle")).toBeInTheDocument();
  });

  it("renders form without unit label when unit is null", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue({ ...sampleChallenge, unit: null });

    const ui = await LogActivityPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.getByText("Amount")).toBeInTheDocument();
  });

  it("passes a null timezone through when the challenge has none", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetChallenge.mockResolvedValue({ ...sampleChallenge, timezone: null });

    const ui = await LogActivityPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    // Form still renders; the null timezone exercises the `?? null` fallback.
    expect(screen.getByTestId("amount-input")).toBeInTheDocument();
  });
});
