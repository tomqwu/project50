import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockRequireUser } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("./CreateChallengeForm", () => ({
  CreateChallengeForm: () => <div data-testid="create-challenge-form" />,
}));

import NewChallengePage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("NewChallengePage", () => {
  it("requires auth and renders the form", async () => {
    mockRequireUser.mockResolvedValue("u1");
    const ui = await NewChallengePage();
    render(ui);
    expect(screen.getByTestId("create-challenge-form")).toBeInTheDocument();
    expect(mockRequireUser).toHaveBeenCalled();
  });
});
