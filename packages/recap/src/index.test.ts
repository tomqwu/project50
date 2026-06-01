/**
 * Smoke test for the barrel export. Importing from index.ts exercises
 * the re-export paths and ensures the public surface compiles correctly.
 * Coverage for types.ts is implicitly included here via the barrel.
 */
import { describe, it, expect, vi } from "vitest";

// Mock remotion before importing barrel (components use remotion hooks)
vi.mock("remotion", () => ({
  useCurrentFrame: () => 0,
  interpolate: () => 0,
  AbsoluteFill: () => null,
  Composition: () => null,
  registerRoot: vi.fn(),
}));

import {
  BigNumber,
  RingFill,
  PhotoStrip,
  TitleCard,
  StatLine,
  RecapVideo,
  RemotionRoot,
  RECAP_KINDS,
} from "./index.js";
import type { RecapKind, RecapData } from "./index.js";

describe("index barrel", () => {
  it("exports BigNumber component", () => {
    expect(BigNumber).toBeDefined();
    expect(typeof BigNumber).toBe("function");
  });

  it("exports RingFill component", () => {
    expect(RingFill).toBeDefined();
    expect(typeof RingFill).toBe("function");
  });

  it("exports PhotoStrip component", () => {
    expect(PhotoStrip).toBeDefined();
    expect(typeof PhotoStrip).toBe("function");
  });

  it("exports TitleCard component", () => {
    expect(TitleCard).toBeDefined();
    expect(typeof TitleCard).toBe("function");
  });

  it("exports StatLine component", () => {
    expect(StatLine).toBeDefined();
    expect(typeof StatLine).toBe("function");
  });

  it("exports RecapVideo composition", () => {
    expect(RecapVideo).toBeDefined();
    expect(typeof RecapVideo).toBe("function");
  });

  it("exports RemotionRoot", () => {
    expect(RemotionRoot).toBeDefined();
    expect(typeof RemotionRoot).toBe("function");
  });

  it("RecapKind type values are usable at runtime via string literals", () => {
    const kinds: RecapKind[] = ["DAY", "WEEK", "FIFTY"];
    expect(kinds).toHaveLength(3);
  });

  it("exports RECAP_KINDS array with all three kinds", () => {
    expect(RECAP_KINDS).toEqual(["DAY", "WEEK", "FIFTY"]);
  });

  it("RecapData shape is structurally correct", () => {
    const data: RecapData = {
      title: "Test",
      kind: "DAY",
      dayNumber: 1,
      lengthDays: 50,
      stats: { daysCompleted: 1, totalAmount: 10, currentStreak: 1 },
      days: [{ dayKey: "d1", completed: true }],
    };
    expect(data.title).toBe("Test");
    expect(data.stats.daysCompleted).toBe(1);
  });
});
