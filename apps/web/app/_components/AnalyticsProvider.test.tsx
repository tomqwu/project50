import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const isAnalyticsActive = vi.fn<() => boolean>();
vi.mock("@/lib/analytics", () => ({
  isAnalyticsActive: () => isAnalyticsActive(),
}));

import { AnalyticsProvider } from "./AnalyticsProvider";

beforeEach(() => {
  delete (window as { p50Analytics?: unknown }).p50Analytics;
  isAnalyticsActive.mockReset();
});

afterEach(() => cleanup());

describe("AnalyticsProvider", () => {
  it("renders nothing", () => {
    isAnalyticsActive.mockReturnValue(false);
    const { container } = render(<AnalyticsProvider />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not initialize the queue when analytics is inactive", () => {
    isAnalyticsActive.mockReturnValue(false);
    render(<AnalyticsProvider />);
    expect(window.p50Analytics).toBeUndefined();
  });

  it("initializes the queue when analytics is active", () => {
    isAnalyticsActive.mockReturnValue(true);
    render(<AnalyticsProvider />);
    expect(window.p50Analytics).toEqual([]);
  });

  it("preserves an existing queue when active", () => {
    isAnalyticsActive.mockReturnValue(true);
    (window as { p50Analytics?: unknown }).p50Analytics = [
      { event: "signup", ts: 1 },
    ];
    render(<AnalyticsProvider />);
    expect(window.p50Analytics).toHaveLength(1);
  });
});
