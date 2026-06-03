import { describe, it, expect } from "vitest";
import { PROJECT50_RULES, PROJECT50_LENGTH_DAYS } from "./project50";

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
