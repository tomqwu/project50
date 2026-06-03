import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  afterEach(() => cleanup());

  it("renders a status region with the default label", () => {
    render(<Spinner />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-label", "Loading");
  });

  it("honors a custom label", () => {
    render(<Spinner label="Fetching feed" />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Fetching feed",
    );
  });

  it("renders at a custom size", () => {
    render(<Spinner size={24} />);
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });
});
