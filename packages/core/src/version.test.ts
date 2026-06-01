import { describe, expect, it } from "vitest";
import { coreVersion } from "./version";

describe("coreVersion", () => {
  it("returns the semantic version string", () => {
    expect(coreVersion()).toBe("0.0.0");
  });
});
