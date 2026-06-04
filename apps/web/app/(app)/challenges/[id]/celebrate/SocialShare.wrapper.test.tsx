import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

// Stub the heavy client implementation so the wrapper test stays focused on the
// dynamic-import plumbing (and doesn't pull in fetch/publish logic).
vi.mock("./SocialShareClient", () => ({
  SocialShareClient: ({
    challengeId,
    hasRecap,
    isPublic,
  }: {
    challengeId: string;
    hasRecap: boolean;
    isPublic: boolean;
  }) => (
    <div
      data-testid="social-share-client"
      data-challenge-id={challengeId}
      data-has-recap={String(hasRecap)}
      data-is-public={String(isPublic)}
    />
  ),
}));

import { SocialShare } from "./SocialShare";

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("SocialShare wrapper (next/dynamic)", () => {
  it("lazily renders the client implementation and forwards props", async () => {
    render(
      <SocialShare
        challengeId="c1"
        hasRecap
        isPublic
        capabilities={[]}
      />,
    );

    const client = await waitFor(() => screen.getByTestId("social-share-client"));
    expect(client).toHaveAttribute("data-challenge-id", "c1");
    expect(client).toHaveAttribute("data-has-recap", "true");
    expect(client).toHaveAttribute("data-is-public", "true");
  });
});
