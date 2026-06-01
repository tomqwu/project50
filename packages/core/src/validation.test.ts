import { describe, expect, it } from "vitest";
import { validateActivityInput } from "./validation";

const challenge = {
  goalType: "TARGET" as const,
  startDate: "2026-06-01",
  lengthDays: 50,
};

const base = { dayKey: "2026-06-05", amount: 30, done: false, mood: 3 };

describe("validateActivityInput", () => {
  it("returns no errors for valid input", () => {
    expect(validateActivityInput(challenge, base, "2026-06-10")).toEqual([]);
  });

  it("rejects a future day", () => {
    expect(validateActivityInput(challenge, { ...base, dayKey: "2026-06-11" }, "2026-06-10")).toContain(
      "DAY_IN_FUTURE",
    );
  });

  it("rejects a day before the challenge starts", () => {
    expect(validateActivityInput(challenge, { ...base, dayKey: "2026-05-31" }, "2026-06-10")).toContain(
      "DAY_BEFORE_START",
    );
  });

  it("rejects a day after the challenge window", () => {
    // start 2026-06-01 + 50 days → last day 2026-07-20
    expect(validateActivityInput(challenge, { ...base, dayKey: "2026-07-21" }, "2026-12-31")).toContain(
      "DAY_AFTER_END",
    );
  });

  it("rejects a negative amount", () => {
    expect(validateActivityInput(challenge, { ...base, amount: -1 }, "2026-06-10")).toContain(
      "AMOUNT_NEGATIVE",
    );
  });

  it("rejects an out-of-range mood", () => {
    expect(validateActivityInput(challenge, { ...base, mood: 6 }, "2026-06-10")).toContain("MOOD_OUT_OF_RANGE");
    expect(validateActivityInput(challenge, { ...base, mood: 0 }, "2026-06-10")).toContain("MOOD_OUT_OF_RANGE");
  });

  it("allows an omitted mood", () => {
    const { mood: _omit, ...noMood } = base;
    expect(validateActivityInput(challenge, noMood, "2026-06-10")).toEqual([]);
  });

  it("accumulates multiple errors", () => {
    const bad = { dayKey: "2026-05-31", amount: -5, done: false, mood: 9 };
    expect(validateActivityInput(challenge, bad, "2026-06-10").sort()).toEqual(
      ["AMOUNT_NEGATIVE", "DAY_BEFORE_START", "MOOD_OUT_OF_RANGE"].sort(),
    );
  });
});
