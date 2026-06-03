import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import NotFound from "./not-found";

describe("global not-found", () => {
  afterEach(() => cleanup());

  it("renders an empty state with the not-found title", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders a home link", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: "Back to home" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});
