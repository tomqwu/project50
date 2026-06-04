import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

// Stub the heavy client implementation so the wrapper test stays focused on the
// dynamic-import plumbing (and doesn't pull in fetch/video logic).
vi.mock("./RecapPanelClient", () => ({
  RecapPanelClient: ({
    challengeId,
    initialRecaps,
  }: {
    challengeId: string;
    initialRecaps?: unknown[];
  }) => (
    <div
      data-testid="recap-panel-client"
      data-challenge-id={challengeId}
      data-recap-count={initialRecaps?.length ?? 0}
    />
  ),
}));

import { RecapPanel } from "./RecapPanel";

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("RecapPanel wrapper (next/dynamic)", () => {
  it("lazily renders the client implementation and forwards props", async () => {
    render(
      <RecapPanel
        challengeId="c1"
        initialRecaps={[
          { id: "r1", kind: "DAY", url: "https://x/d.mp4", createdAt: new Date() },
        ]}
      />,
    );

    const client = await waitFor(() => screen.getByTestId("recap-panel-client"));
    expect(client).toHaveAttribute("data-challenge-id", "c1");
    expect(client).toHaveAttribute("data-recap-count", "1");
  });

  it("defaults initialRecaps when omitted", async () => {
    render(<RecapPanel challengeId="c2" />);

    const client = await waitFor(() => screen.getByTestId("recap-panel-client"));
    expect(client).toHaveAttribute("data-challenge-id", "c2");
  });
});
