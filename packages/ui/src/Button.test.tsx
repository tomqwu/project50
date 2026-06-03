import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("renders as a <button> element", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("defaults to primary variant", () => {
    render(<Button>Primary</Button>);
    expect(screen.getByRole("button", { name: "Primary" })).toHaveAttribute(
      "data-variant",
      "primary"
    );
  });

  it("accepts primary variant explicitly", () => {
    render(<Button variant="primary">P</Button>);
    expect(screen.getByRole("button", { name: "P" })).toHaveAttribute(
      "data-variant",
      "primary"
    );
  });

  it("accepts ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole("button", { name: "Ghost" })).toHaveAttribute(
      "data-variant",
      "ghost"
    );
  });

  it("accepts danger variant", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "danger"
    );
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Click" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Disabled
      </Button>
    );
    fireEvent.click(screen.getByRole("button", { name: "Disabled" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("sets disabled attribute when disabled", () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole("button", { name: "Off" })).toBeDisabled();
  });

  it("primary variant uses accent background CSS variable", () => {
    render(<Button variant="primary">P</Button>);
    const btn = screen.getByRole("button", { name: "P" });
    const style = btn.getAttribute("style") ?? "";
    expect(style).toContain("var(--accent)");
  });

  it("ghost variant uses transparent background", () => {
    render(<Button variant="ghost">G</Button>);
    const btn = screen.getByRole("button", { name: "G" });
    const style = btn.getAttribute("style") ?? "";
    expect(style).toContain("transparent");
  });

  it("ghost variant uses hairline border CSS variable", () => {
    render(<Button variant="ghost">G</Button>);
    const btn = screen.getByRole("button", { name: "G" });
    const style = btn.getAttribute("style") ?? "";
    expect(style).toContain("var(--hairline)");
  });

  it("danger variant uses red/danger color", () => {
    render(<Button variant="danger">Del</Button>);
    const btn = screen.getByRole("button", { name: "Del" });
    expect(btn).toHaveAttribute("data-variant", "danger");
  });

  it("applies uppercase tracking styles", () => {
    render(<Button>Log</Button>);
    const btn = screen.getByRole("button", { name: "Log" });
    expect(btn).toHaveStyle({ textTransform: "uppercase" });
  });

  it("accepts type attribute", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button", { name: "Submit" })).toHaveAttribute(
      "type",
      "submit"
    );
  });

  it("defaults type to button", () => {
    render(<Button>Btn</Button>);
    expect(screen.getByRole("button", { name: "Btn" })).toHaveAttribute(
      "type",
      "button"
    );
  });

  it("forwards data-testid to the button element", () => {
    render(<Button data-testid="cta">Hi</Button>);
    expect(screen.getByTestId("cta")).toBe(
      screen.getByRole("button", { name: "Hi" })
    );
  });

  it("forwards arbitrary rest props (e.g. aria-label, id)", () => {
    render(
      <Button id="save-btn" aria-label="Save changes">
        Save
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Save changes" });
    expect(btn).toHaveAttribute("id", "save-btn");
  });

  it("forwards a ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Ref" }));
  });

  it("sets aria-disabled when disabled", () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole("button", { name: "Off" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("does not set aria-disabled when enabled", () => {
    render(<Button>On</Button>);
    expect(screen.getByRole("button", { name: "On" })).toHaveAttribute(
      "aria-disabled",
      "false"
    );
  });

  it("merges consumer-provided inline style with base styles", () => {
    render(<Button style={{ marginTop: "8px" }}>Styled</Button>);
    const btn = screen.getByRole("button", { name: "Styled" });
    expect(btn).toHaveStyle({ marginTop: "8px" });
    // base styles still applied
    expect(btn).toHaveStyle({ textTransform: "uppercase" });
  });

  it("appends consumer className alongside the focus-visible class", () => {
    render(<Button className="extra">C</Button>);
    const btn = screen.getByRole("button", { name: "C" });
    expect(btn.className).toContain("extra");
  });

  it("exposes a stable className for focus-visible styling", () => {
    render(<Button>F</Button>);
    const btn = screen.getByRole("button", { name: "F" });
    expect(btn.className).toContain("p50-button");
  });
});
