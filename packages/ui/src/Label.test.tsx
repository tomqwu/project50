import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Label } from "./Label";

describe("Label", () => {
  it("renders children text", () => {
    render(<Label>streak</Label>);
    expect(screen.getByText("streak")).toBeInTheDocument();
  });

  it("renders as a span by default", () => {
    render(<Label>hello</Label>);
    const el = screen.getByText("hello");
    expect(el.tagName.toLowerCase()).toBe("span");
  });

  it("applies uppercase text-transform style", () => {
    render(<Label>test</Label>);
    const el = screen.getByText("test");
    expect(el).toHaveStyle({ textTransform: "uppercase" });
  });

  it("applies letter-spacing style", () => {
    render(<Label>spacing</Label>);
    const el = screen.getByText("spacing");
    // Letter-spacing should be non-zero
    const style = el.getAttribute("style");
    expect(style).toContain("letter-spacing");
  });

  it("applies muted color via CSS variable", () => {
    render(<Label>muted</Label>);
    const el = screen.getByText("muted");
    const style = el.getAttribute("style");
    expect(style).toContain("var(--muted)");
  });

  it("renders multiple children", () => {
    render(<Label><span>a</span><span>b</span></Label>);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });
});
