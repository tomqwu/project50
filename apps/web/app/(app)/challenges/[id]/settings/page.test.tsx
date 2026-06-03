import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockRequireUser, mockGetChallenge, mockNotFound } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockGetChallenge: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/challenges", () => ({ getChallenge: mockGetChallenge }));
vi.mock("next/navigation", () => ({ notFound: mockNotFound }));
vi.mock("../ChallengeSettings", () => ({
  ChallengeSettings: (props: Record<string, unknown>) => (
    <div
      data-testid="challenge-settings"
      data-id={String(props.id)}
      data-title={String(props.title)}
      data-goaltype={String(props.goalType)}
      data-unit={String(props.unit)}
      data-dailytarget={String(props.dailyTarget)}
      data-visibility={String(props.visibility)}
    />
  ),
}));

import ChallengeSettingsPage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function makeParams(id: string) {
  return Promise.resolve({ id });
}

describe("ChallengeSettingsPage", () => {
  it("renders ChallengeSettings with the owner's challenge fields", async () => {
    mockRequireUser.mockResolvedValue("owner-1");
    mockGetChallenge.mockResolvedValue({
      id: "c1",
      ownerId: "owner-1",
      title: "Run 5K",
      goalType: "TARGET",
      unit: "km",
      dailyTarget: 5,
      visibility: "PUBLIC",
    });

    const ui = await ChallengeSettingsPage({ params: makeParams("c1") });
    render(ui);

    const el = screen.getByTestId("challenge-settings");
    expect(el).toHaveAttribute("data-id", "c1");
    expect(el).toHaveAttribute("data-title", "Run 5K");
    expect(el).toHaveAttribute("data-goaltype", "TARGET");
    expect(el).toHaveAttribute("data-unit", "km");
    expect(el).toHaveAttribute("data-dailytarget", "5");
    expect(el).toHaveAttribute("data-visibility", "PUBLIC");
    expect(mockGetChallenge).toHaveBeenCalledWith("c1", "owner-1");
  });

  it("calls notFound when the viewer is not the owner", async () => {
    mockNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockRequireUser.mockResolvedValue("stranger");
    mockGetChallenge.mockResolvedValue({
      id: "c1",
      ownerId: "owner-1",
      title: "Run 5K",
      goalType: "TARGET",
      unit: "km",
      dailyTarget: 5,
      visibility: "PUBLIC",
    });

    await expect(
      ChallengeSettingsPage({ params: makeParams("c1") }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });
});
