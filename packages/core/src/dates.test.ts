import { describe, expect, it } from "vitest";
import { addDays, dayNumber, isValidTimeZone, localDayKey, safeTimeZone } from "./dates";

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

  it("falls back to UTC for a blank or whitespace-only timezone (no throw)", () => {
    const instant = new Date("2026-06-01T20:00:00Z");
    const utc = localDayKey(instant, "UTC");
    expect(localDayKey(instant, "")).toBe(utc);
    expect(localDayKey(instant, "   ")).toBe(utc);
  });

  it("falls back to UTC for a malformed timezone instead of throwing", () => {
    const instant = new Date("2026-06-01T20:00:00Z");
    expect(() => localDayKey(instant, "Not/A_Zone")).not.toThrow();
    expect(localDayKey(instant, "Not/A_Zone")).toBe(localDayKey(instant, "UTC"));
  });
});

describe("safeTimeZone", () => {
  it("returns a valid IANA zone unchanged", () => {
    expect(safeTimeZone("America/New_York")).toBe("America/New_York");
    expect(safeTimeZone("Asia/Shanghai")).toBe("Asia/Shanghai");
    expect(safeTimeZone("UTC")).toBe("UTC");
  });

  it("falls back to UTC for blank, whitespace, null, or undefined", () => {
    expect(safeTimeZone("")).toBe("UTC");
    expect(safeTimeZone("   ")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
    expect(safeTimeZone(undefined)).toBe("UTC");
  });

  it("falls back to UTC for a malformed zone (no throw)", () => {
    expect(() => safeTimeZone("Not/A_Zone")).not.toThrow();
    expect(safeTimeZone("Not/A_Zone")).toBe("UTC");
  });

  it("memoizes repeated lookups (same result on second call)", () => {
    expect(safeTimeZone("Europe/Paris")).toBe("Europe/Paris");
    expect(safeTimeZone("Europe/Paris")).toBe("Europe/Paris");
  });
});

describe("isValidTimeZone", () => {
  it("is true only for a valid, exact IANA zone", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("is false for blank, null, undefined, or malformed zones", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone("Not/A_Zone")).toBe(false);
  });

  it("accepts a valid zone with surrounding whitespace (trimmed before check)", () => {
    expect(isValidTimeZone("  UTC  ")).toBe(true);
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
