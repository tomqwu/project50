import { describe, expect, it } from "vitest";
import { addDays, dayNumber, localDayKey } from "./dates";

describe("localDayKey", () => {
  it("formats an instant as YYYY-MM-DD in the given timezone", () => {
    // 2026-06-01T05:30:00Z is still 2026-06-01 in UTC and in Asia/Shanghai (+08 → 13:30)
    expect(localDayKey(new Date("2026-06-01T05:30:00Z"), "UTC")).toBe("2026-06-01");
    expect(localDayKey(new Date("2026-06-01T05:30:00Z"), "Asia/Shanghai")).toBe("2026-06-01");
  });

  it("rolls the day backward for a timezone behind UTC", () => {
    // 2026-06-01T02:00:00Z is 2026-05-31 21:00 in America/New_York (-05)
    expect(localDayKey(new Date("2026-06-01T02:00:00Z"), "America/New_York")).toBe("2026-05-31");
  });

  it("rolls the day forward for a timezone ahead of UTC", () => {
    // 2026-06-01T20:00:00Z is 2026-06-02 04:00 in Asia/Shanghai (+08)
    expect(localDayKey(new Date("2026-06-01T20:00:00Z"), "Asia/Shanghai")).toBe("2026-06-02");
  });
});

describe("addDays", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-01-01", 31)).toBe("2026-02-01");
  });
  it("subtracts with negative n", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dayNumber", () => {
  it("is 1-based from the start date", () => {
    expect(dayNumber("2026-06-01", "2026-06-01")).toBe(1);
    expect(dayNumber("2026-06-01", "2026-06-10")).toBe(10);
  });
  it("returns <=0 for days before the start", () => {
    expect(dayNumber("2026-06-01", "2026-05-31")).toBe(0);
  });
});
