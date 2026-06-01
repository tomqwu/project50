import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// We mock Composition (and registerRoot) so Root.tsx can be imported without a
// real Remotion runtime. The test checks that Composition is rendered with the
// correct static props.
const CompositionMock = vi.fn((_p: Record<string, unknown>) => {
  void _p; // captured via mock.calls; render output is a fixed placeholder
  return <div data-testid="mock-composition" />;
});

vi.mock("remotion", () => ({
  useCurrentFrame: () => 0,
  interpolate: () => 0,
  AbsoluteFill: ({ children, style, ...props }: React.PropsWithChildren<{ style?: React.CSSProperties; [key: string]: unknown }>) =>
    React.createElement("div", { style, ...props }, children),
  Composition: (props: Record<string, unknown>) => CompositionMock(props),
  registerRoot: vi.fn(), // no-op in tests
}));

import { RemotionRoot } from "./Root.js";

describe("RemotionRoot", () => {
  it("renders without throwing", () => {
    render(<RemotionRoot />);
    expect(screen.getByTestId("mock-composition")).toBeInTheDocument();
  });

  it("passes id='recap' to Composition", () => {
    render(<RemotionRoot />);
    const call = CompositionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call?.["id"]).toBe("recap");
  });

  it("sets fps to 30", () => {
    render(<RemotionRoot />);
    const call = CompositionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call?.["fps"]).toBe(30);
  });

  it("sets width to 1080 and height to 1920 (portrait 9:16)", () => {
    render(<RemotionRoot />);
    const call = CompositionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call?.["width"]).toBe(1080);
    expect(call?.["height"]).toBe(1920);
  });

  it("provides defaultProps with a valid RecapData shape", () => {
    render(<RemotionRoot />);
    const call = CompositionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const dp = call?.["defaultProps"] as Record<string, unknown>;
    expect(dp).toHaveProperty("title");
    expect(dp).toHaveProperty("kind");
    expect(dp).toHaveProperty("stats");
    expect(dp).toHaveProperty("days");
  });

  it("wires RecapVideo as the composition component", async () => {
    const { RecapVideo } = await import("./RecapVideo.js");
    render(<RemotionRoot />);
    const call = CompositionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call?.["component"]).toBe(RecapVideo);
  });
});
