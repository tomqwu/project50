import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockRequireUser, mockGetReferralStats } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockGetReferralStats: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/referral", () => ({
  getReferralStats: mockGetReferralStats,
}));
vi.mock("./_components/ReferralSection", () => ({
  ReferralSection: ({
    code,
    referredCount,
  }: {
    code: string;
    referredCount: number;
  }) => (
    <div data-testid="referral-section">
      {code}:{referredCount}
    </div>
  ),
}));

import ReferPage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ReferPage", () => {
  it("requires auth, loads stats, and renders the section", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetReferralStats.mockResolvedValue({ code: "ABCD2345", referredCount: 3 });

    const ui = await ReferPage();
    render(ui);

    expect(mockRequireUser).toHaveBeenCalled();
    expect(mockGetReferralStats).toHaveBeenCalledWith("u1");
    expect(screen.getByTestId("referral-section")).toHaveTextContent(
      "ABCD2345:3",
    );
  });
});
