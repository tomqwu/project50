import { describe, expect, it } from "vitest";
import { computeDayCompletion } from "./completion";

const target = { goalType: "TARGET" as const, dailyTarget: 60 };
const binary = { goalType: "BINARY" as const };

describe("computeDayCompletion (TARGET)", () => {
  it("sums amounts and completes when the target is met", () => {
    expect(computeDayCompletion(target, [{ amount: 25 }, { amount: 35 }])).toEqual({
      totalAmount: 60,
      completed: true,
    });
  });
  it("is incomplete below target", () => {
    expect(computeDayCompletion(target, [{ amount: 20 }])).toEqual({
      totalAmount: 20,
      completed: false,
    });
  });
  it("treats missing amounts as zero", () => {
    expect(computeDayCompletion(target, [{}, { amount: 10 }])).toEqual({
      totalAmount: 10,
      completed: false,
    });
  });
  it("is incomplete with no activities", () => {
    expect(computeDayCompletion(target, [])).toEqual({ totalAmount: 0, completed: false });
  });
  it("is incomplete when dailyTarget is omitted (defaults to 0, so target > 0 is false)", () => {
    const noTarget = { goalType: "TARGET" as const };
    expect(computeDayCompletion(noTarget, [{ amount: 100 }])).toEqual({ totalAmount: 100, completed: false });
  });
});

describe("computeDayCompletion (BINARY)", () => {
  it("completes when any activity is done", () => {
    expect(computeDayCompletion(binary, [{ done: false }, { done: true }])).toEqual({
      totalAmount: 0,
      completed: true,
    });
  });
  it("is incomplete when none are done", () => {
    expect(computeDayCompletion(binary, [{ done: false }])).toEqual({
      totalAmount: 0,
      completed: false,
    });
  });
});
