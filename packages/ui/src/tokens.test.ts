import { describe, it, expect } from "vitest";
import { momentum } from "./tokens";
import type { MomentumToken } from "./tokens";

describe("momentum tokens", () => {
  it("has exact bg hex", () => {
    expect(momentum.bg).toBe("#121013");
  });

  it("has exact card hex", () => {
    expect(momentum.card).toBe("#1C1A1E");
  });

  it("has exact surface2 hex", () => {
    expect(momentum.surface2).toBe("#232026");
  });

  it("has exact text hex", () => {
    expect(momentum.text).toBe("#F2F0EC");
  });

  it("has exact muted hex", () => {
    expect(momentum.muted).toBe("#8C8A86");
  });

  it("has exact accent (volt) hex", () => {
    expect(momentum.accent).toBe("#D6FF3F");
  });

  it("has exact danger hex", () => {
    expect(momentum.danger).toBe("#E5484D");
  });

  it("has exact hairline rgba", () => {
    expect(momentum.hairline).toBe("rgba(242,240,236,0.08)");
  });

  it("has exactly 8 tokens", () => {
    expect(Object.keys(momentum)).toHaveLength(8);
  });

  it("MomentumToken type covers all keys", () => {
    // Compile-time check: each key must be assignable to MomentumToken
    const keys: MomentumToken[] = [
      "bg",
      "card",
      "surface2",
      "text",
      "muted",
      "accent",
      "danger",
      "hairline",
    ];
    expect(keys).toHaveLength(8);
  });
});
