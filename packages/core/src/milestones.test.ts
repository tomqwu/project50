import { describe, expect, it } from "vitest";
import { evaluateMilestones } from "./milestones";

describe("evaluateMilestones", () => {
  it("awards completion badges at thresholds", () => {
    expect(evaluateMilestones({ completedCount: 7, currentStreak: 1 })).toContain("COMPLETED_7");
    expect(evaluateMilestones({ completedCount: 25, currentStreak: 1 })).toEqual(
      expect.arrayContaining(["COMPLETED_7", "COMPLETED_25"]),
    );
    expect(evaluateMilestones({ completedCount: 50, currentStreak: 1 })).toEqual(
      expect.arrayContaining(["COMPLETED_7", "COMPLETED_25", "COMPLETED_50"]),
    );
  });

  it("awards streak badges at thresholds", () => {
    expect(evaluateMilestones({ completedCount: 7, currentStreak: 7 })).toContain("STREAK_7");
    expect(evaluateMilestones({ completedCount: 30, currentStreak: 30 })).toEqual(
      expect.arrayContaining(["STREAK_7", "STREAK_30"]),
    );
  });

  it("awards nothing below the first threshold", () => {
    expect(evaluateMilestones({ completedCount: 6, currentStreak: 6 })).toEqual([]);
  });

  it("returns kinds in a stable order", () => {
    expect(evaluateMilestones({ completedCount: 50, currentStreak: 30 })).toEqual([
      "COMPLETED_7",
      "COMPLETED_25",
      "COMPLETED_50",
      "STREAK_7",
      "STREAK_30",
    ]);
  });
});
