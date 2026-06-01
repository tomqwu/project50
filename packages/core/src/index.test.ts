import { describe, expect, it } from "vitest";
import * as core from "./index";
import { coreVersion } from "./version";

describe("core public API", () => {
  it("re-exports coreVersion", () => {
    expect(core.coreVersion).toBe(coreVersion);
    expect(core.coreVersion()).toBe("0.0.0");
  });
});
