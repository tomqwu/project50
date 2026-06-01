import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("returns correct name and short_name", () => {
    const m = manifest();
    expect(m.name).toBe("project50");
    expect(m.short_name).toBe("project50");
  });

  it("returns start_url /", () => {
    const m = manifest();
    expect(m.start_url).toBe("/");
  });

  it("returns display standalone", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
  });

  it("returns Momentum charcoal background and theme colors", () => {
    const m = manifest();
    expect(m.background_color).toBe("#121013");
    expect(m.theme_color).toBe("#121013");
  });

  it("includes 192x192 icon", () => {
    const m = manifest();
    const icon192 = m.icons?.find((i) => i.sizes === "192x192");
    expect(icon192).toBeDefined();
    expect(icon192?.src).toBe("/icon-192.png");
    expect(icon192?.type).toBe("image/png");
  });

  it("includes 512x512 icon", () => {
    const m = manifest();
    const icon512 = m.icons?.find((i) => i.sizes === "512x512");
    expect(icon512).toBeDefined();
    expect(icon512?.src).toBe("/icon-512.png");
    expect(icon512?.type).toBe("image/png");
  });
});
