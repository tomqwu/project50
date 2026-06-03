import { describe, it, expect } from "vitest";
import {
  momentum,
  Button,
  Card,
  Label,
  StatTile,
  ProgressRing,
} from "./index";

describe("index barrel", () => {
  it("exports momentum tokens", () => {
    expect(momentum).toBeDefined();
    expect(momentum.accent).toBe("#D6FF3F");
  });

  it("exports Button component", () => {
    // Button is a forwardRef component (an object with a render function),
    // which is a valid React component export.
    expect(Button).toBeDefined();
    expect(typeof Button).toBe("object");
  });

  it("exports Card component", () => {
    expect(typeof Card).toBe("function");
  });

  it("exports Label component", () => {
    expect(typeof Label).toBe("function");
  });

  it("exports StatTile component", () => {
    expect(typeof StatTile).toBe("function");
  });

  it("exports ProgressRing component", () => {
    expect(typeof ProgressRing).toBe("function");
  });
});
