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

  it("renders as a <label> element when htmlFor is provided", () => {
    render(<Label htmlFor="email">Email</Label>);
    const el = screen.getByText("Email");
    expect(el.tagName.toLowerCase()).toBe("label");
    expect(el).toHaveAttribute("for", "email");
  });

  it("associates with a control via htmlFor", () => {
    render(
      <div>
        <Label htmlFor="email">Email</Label>
        <input id="email" />
      </div>
    );
    // getByLabelText resolves only when the association is wired correctly.
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("forwards data-testid", () => {
    render(<Label data-testid="lbl">Tag</Label>);
    expect(screen.getByTestId("lbl")).toBeInTheDocument();
  });

  it("forwards arbitrary rest props (e.g. id)", () => {
    render(<Label id="my-label">Tag</Label>);
    expect(screen.getByText("Tag")).toHaveAttribute("id", "my-label");
  });

  it("merges consumer inline style with base styles", () => {
    render(<Label style={{ marginBottom: "4px" }}>Styled</Label>);
    const el = screen.getByText("Styled");
    expect(el).toHaveStyle({ marginBottom: "4px" });
    expect(el).toHaveStyle({ textTransform: "uppercase" });
  });
});
