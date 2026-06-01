import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressRing } from "./ProgressRing";

describe("ProgressRing", () => {
  it("renders an svg element", () => {
    const { container } = render(
      <ProgressRing value={30} max={60} label="progress" />
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("svg has role=img", () => {
    render(<ProgressRing value={30} max={60} label="30 of 60 minutes" />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("svg has correct aria-label", () => {
    render(<ProgressRing value={30} max={60} label="Daily progress" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "Daily progress"
    );
  });

  it("renders value/max text inside ring", () => {
    render(<ProgressRing value={30} max={60} label="ring" />);
    expect(screen.getByText("30/60")).toBeInTheDocument();
  });

  it("when value equals max, progress dashoffset is 0 (full circle)", () => {
    const { container } = render(
      <ProgressRing value={60} max={60} label="done" />
    );
    const circles = container.querySelectorAll("circle");
    // Second circle is the progress arc
    const progressCircle = circles[1];
    expect(progressCircle).toBeTruthy();
    const offset = progressCircle?.getAttribute("stroke-dashoffset");
    expect(Number(offset)).toBeCloseTo(0, 1);
  });

  it("when value is 0, dashoffset equals circumference (empty ring)", () => {
    const size = 160;
    const strokeWidth = 14;
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;

    const { container } = render(
      <ProgressRing value={0} max={60} label="empty" />
    );
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    expect(progressCircle).toBeTruthy();
    const offset = Number(progressCircle?.getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(circumference, 0);
  });

  it("when value is half of max, dashoffset is ~half circumference", () => {
    const size = 160;
    const strokeWidth = 14;
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;

    const { container } = render(
      <ProgressRing value={30} max={60} label="half" />
    );
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    expect(progressCircle).toBeTruthy();
    const offset = Number(progressCircle?.getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(circumference / 2, 0);
  });

  it("clamps value > max to max (offset = 0)", () => {
    const { container } = render(
      <ProgressRing value={999} max={60} label="over" />
    );
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    const offset = Number(progressCircle?.getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(0, 1);
  });

  it("clamps value < 0 to 0 (offset = circumference)", () => {
    const size = 160;
    const strokeWidth = 14;
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;

    const { container } = render(
      <ProgressRing value={-10} max={60} label="negative" />
    );
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    const offset = Number(progressCircle?.getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(circumference, 0);
  });

  it("uses default size=160 when not specified", () => {
    const { container } = render(
      <ProgressRing value={10} max={60} label="default size" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "160");
    expect(svg).toHaveAttribute("height", "160");
  });

  it("accepts custom size prop", () => {
    const { container } = render(
      <ProgressRing value={10} max={60} size={200} label="custom size" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "200");
    expect(svg).toHaveAttribute("height", "200");
  });

  it("custom size uses correct circumference for geometry", () => {
    const size = 200;
    const strokeWidth = 14;
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;

    const { container } = render(
      <ProgressRing value={0} max={60} size={size} label="custom geom" />
    );
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    const offset = Number(progressCircle?.getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(circumference, 0);
  });

  it("progress circle has volt accent stroke color", () => {
    const { container } = render(
      <ProgressRing value={30} max={60} label="color" />
    );
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    // Stroke is set via CSS variable or inline attribute
    const stroke = progressCircle?.getAttribute("stroke") ?? "";
    const style = progressCircle?.getAttribute("style") ?? "";
    expect(stroke + style).toMatch(/var\(--accent\)|#D6FF3F|#d6ff3f/i);
  });

  it("background track circle is rendered first", () => {
    const { container } = render(
      <ProgressRing value={30} max={60} label="track" />
    );
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });

  it("progress circle has glow filter applied", () => {
    const { container } = render(
      <ProgressRing value={30} max={60} label="glow" />
    );
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    const style = progressCircle?.getAttribute("style") ?? "";
    // Either filter or drop-shadow
    expect(style).toMatch(/filter|drop-shadow/i);
  });

  it("renders value text using display font variable", () => {
    render(<ProgressRing value={25} max={60} label="font test" />);
    const valueText = screen.getByText("25/60");
    const style = valueText.getAttribute("style") ?? "";
    expect(style).toContain("var(--font-display");
  });

  it("svg is rotated -90deg for top-start orientation", () => {
    const { container } = render(
      <ProgressRing value={10} max={60} label="rotate" />
    );
    const svg = container.querySelector("svg");
    const style = svg?.getAttribute("style") ?? "";
    expect(style).toContain("rotate(-90deg)");
  });

  it("handles max=0 gracefully (no division by zero crash)", () => {
    expect(() =>
      render(<ProgressRing value={0} max={0} label="zero max" />)
    ).not.toThrow();
  });

  it("when max=0, renders 0/0 text", () => {
    render(<ProgressRing value={0} max={0} label="zero max text" />);
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });

  it("stroke-dasharray is set on progress circle", () => {
    const { container } = render(
      <ProgressRing value={30} max={60} label="dasharray" />
    );
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    const dashArray = progressCircle?.getAttribute("stroke-dasharray");
    expect(dashArray).toBeTruthy();
    // Should contain the circumference value
    expect(Number(dashArray?.split(" ")[0])).toBeGreaterThan(0);
  });
});
