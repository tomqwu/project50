import { describe, it, expect } from "vitest";
import {
  PROJECT50_RULES,
  PROJECT50_LENGTH_DAYS,
  project50CurrentDay,
} from "./project50";

describe("PROJECT50_RULES", () => {
  it("has exactly 7 rules with ids 1..7 and non-empty titles", () => {
    expect(PROJECT50_RULES).toHaveLength(7);
    expect(PROJECT50_RULES.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const r of PROJECT50_RULES) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });
  it("fixes the program length at 50 days", () => {
    expect(PROJECT50_LENGTH_DAYS).toBe(50);
  });
});

describe("project50CurrentDay", () => {
  // A compliant run started today is on Day 1 (no elapsed past days to check).
  it("returns 1 on the start day", () => {
    expect(
      project50CurrentDay({
        startDate: "2026-06-10",
        todayKey: "2026-06-10",
        completedDayKeys: [],
      }),
    ).toBe(1);
  });

  it("returns the current day number when every elapsed past day is completed", () => {
    // Day 3: startDate..yesterday = {06-10, 06-11} must both be completed.
    expect(
      project50CurrentDay({
        startDate: "2026-06-10",
        todayKey: "2026-06-12",
        completedDayKeys: ["2026-06-10", "2026-06-11"],
      }),
    ).toBe(3);
  });

  it("does not require today itself to be completed yet", () => {
    // On Day 3, today (06-12) is still in progress — only past days are checked.
    expect(
      project50CurrentDay({
        startDate: "2026-06-10",
        todayKey: "2026-06-12",
        completedDayKeys: ["2026-06-10", "2026-06-11"],
      }),
    ).toBe(3);
  });

  it("returns 0 when an elapsed past day was missed (should have hard-reset)", () => {
    // Yesterday (06-11) is missing → the run is dead, not currently active.
    expect(
      project50CurrentDay({
        startDate: "2026-06-10",
        todayKey: "2026-06-12",
        completedDayKeys: ["2026-06-10"],
      }),
    ).toBe(0);
  });

  it("returns 0 when the first day was missed", () => {
    expect(
      project50CurrentDay({
        startDate: "2026-06-10",
        todayKey: "2026-06-12",
        completedDayKeys: ["2026-06-11"],
      }),
    ).toBe(0);
  });

  it("clamps a far-past compliant run to the program length", () => {
    // 200 days elapsed but every day completed → clamp to 50.
    const completed: string[] = [];
    const start = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 200; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      completed.push(d.toISOString().slice(0, 10));
    }
    expect(
      project50CurrentDay({
        startDate: "2026-01-01",
        todayKey: "2026-07-20",
        completedDayKeys: completed,
      }),
    ).toBe(50);
  });

  it("returns 0 when todayKey is before startDate (not yet begun)", () => {
    expect(
      project50CurrentDay({
        startDate: "2026-06-10",
        todayKey: "2026-06-09",
        completedDayKeys: [],
      }),
    ).toBe(0);
  });

  it("returns 50 for a run that finished all 50 days but is still ACTIVE on day 52", () => {
    // Only days 1..50 have DayStatus rows; today is day 52 (program over). The
    // compliance check must clamp to the program window and NOT demand day-51/52
    // rows that can never exist — a finished run is not "dead".
    const completed: string[] = [];
    for (let i = 0; i < 50; i++) {
      const d = new Date("2026-01-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      completed.push(d.toISOString().slice(0, 10));
    }
    // start 2026-01-01 → day 50 is 2026-02-19, day 52 is 2026-02-21.
    expect(
      project50CurrentDay({
        startDate: "2026-01-01",
        todayKey: "2026-02-21",
        completedDayKeys: completed,
      }),
    ).toBe(50);
  });

  it("returns 0 when a finished run MISSED a day within the 1..50 window", () => {
    // Today is past day 50 but day 2 was never completed → the run died long ago.
    const completed: string[] = [];
    for (let i = 0; i < 50; i++) {
      if (i === 1) continue; // skip day 2
      const d = new Date("2026-01-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      completed.push(d.toISOString().slice(0, 10));
    }
    expect(
      project50CurrentDay({
        startDate: "2026-01-01",
        todayKey: "2026-02-21",
        completedDayKeys: completed,
      }),
    ).toBe(0);
  });
});
