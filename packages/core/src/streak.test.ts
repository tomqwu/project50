import { describe, expect, it } from "vitest";
import { currentStreak, longestStreak } from "./streak";

describe("currentStreak", () => {
  it("counts consecutive completed days ending at asOf", () => {
    const done = ["2026-06-01", "2026-06-02", "2026-06-03"];
    expect(currentStreak(done, "2026-06-03")).toBe(3);
  });
  it("is 0 when asOf day is not completed", () => {
    expect(currentStreak(["2026-06-01", "2026-06-02"], "2026-06-03")).toBe(0);
  });
  it("stops at the first gap", () => {
    const done = ["2026-06-01", "2026-06-03", "2026-06-04"];
    expect(currentStreak(done, "2026-06-04")).toBe(2);
  });
  it("is 0 for an empty history", () => {
    expect(currentStreak([], "2026-06-04")).toBe(0);
  });
});

describe("longestStreak", () => {
  it("finds the longest consecutive run", () => {
    const done = ["2026-06-01", "2026-06-02", "2026-06-04", "2026-06-05", "2026-06-06"];
    expect(longestStreak(done)).toBe(3);
  });
  it("is 0 for an empty history", () => {
    expect(longestStreak([])).toBe(0);
  });
  it("handles unsorted input with duplicates", () => {
    const done = ["2026-06-02", "2026-06-01", "2026-06-02"];
    expect(longestStreak(done)).toBe(2);
  });
});
