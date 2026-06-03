import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { SkipLink } from "./SkipLink";

describe("SkipLink", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a skip-to-content link targeting the main landmark", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to content" });
    expect(link).toHaveAttribute("href", "#main");
  });

  it("is hidden off-screen until focused, then slides into view", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to content" });
    // Off-screen by default.
    expect(link.style.top).toBe("-48px");
    // Reveals on keyboard focus.
    fireEvent.focus(link);
    expect(link.style.top).toBe("8px");
    // Hides again on blur.
    fireEvent.blur(link);
    expect(link.style.top).toBe("-48px");
  });
});
