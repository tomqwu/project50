import { describe, expect, it } from "vitest";
import * as core from "./index";

describe("core public API", () => {
  it("re-exports every domain function", () => {
    expect(typeof core.coreVersion).toBe("function");
    expect(typeof core.localDayKey).toBe("function");
    expect(typeof core.addDays).toBe("function");
    expect(typeof core.dayNumber).toBe("function");
    expect(typeof core.computeDayCompletion).toBe("function");
    expect(typeof core.currentStreak).toBe("function");
    expect(typeof core.longestStreak).toBe("function");
    expect(typeof core.evaluateMilestones).toBe("function");
    expect(typeof core.validateActivityInput).toBe("function");
  });
});
