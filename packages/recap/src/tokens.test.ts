import { describe, it, expect } from "vitest";
import { colors, fonts } from "./tokens.js";

describe("tokens", () => {
  it("exports charcoal bg hex", () => {
    expect(colors.bg).toBe("#121013");
  });

  it("exports volt accent hex", () => {
    expect(colors.volt).toBe("#D6FF3F");
  });

  it("exports text color", () => {
    expect(colors.text).toBe("#F2F0EC");
  });

  it("exports muted color", () => {
    expect(colors.muted).toBe("#8C8A86");
  });

  it("exports surface and surface2", () => {
    expect(colors.surface).toBeDefined();
    expect(colors.surface2).toBeDefined();
  });

  it("exports hairline color", () => {
    expect(colors.hairline).toBeDefined();
  });

  it("exports Anton display font family", () => {
    expect(fonts.display).toContain("Anton");
  });

  it("exports Sora body font family", () => {
    expect(fonts.body).toContain("Sora");
  });
});
