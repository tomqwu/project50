import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("renders value", () => {
    render(<StatTile value="22" label="Streak" />);
    expect(screen.getByText("22")).toBeInTheDocument();
  });

  it("renders label", () => {
    render(<StatTile value="5" label="Badges" />);
    expect(screen.getByText("Badges")).toBeInTheDocument();
  });

  it("renders numeric value as string", () => {
    render(<StatTile value={42} label="Days" />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("value uses display font CSS variable", () => {
    render(<StatTile value="7" label="Streak" />);
    const valueEl = screen.getByText("7");
    const style = valueEl.getAttribute("style") ?? "";
    expect(style).toContain("var(--font-display");
  });

  it("without accent, value uses text color CSS variable", () => {
    render(<StatTile value="3" label="Cheering" />);
    const valueEl = screen.getByText("3");
    const style = valueEl.getAttribute("style") ?? "";
    expect(style).toContain("var(--text)");
  });

  it("with accent=true, value uses accent color CSS variable", () => {
    render(<StatTile value="10" label="Cheering" accent />);
    const valueEl = screen.getByText("10");
    const style = valueEl.getAttribute("style") ?? "";
    expect(style).toContain("var(--accent)");
  });

  it("label is uppercase (Label component)", () => {
    render(<StatTile value="1" label="days" />);
    const labelEl = screen.getByText("days");
    expect(labelEl).toHaveStyle({ textTransform: "uppercase" });
  });

  it("renders a containing element", () => {
    const { container } = render(<StatTile value="0" label="test" />);
    expect(container.firstChild).toBeTruthy();
  });
});
