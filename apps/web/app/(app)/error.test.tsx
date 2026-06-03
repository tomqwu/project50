import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AppError from "./error";

describe("(app) error boundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders an ErrorState", () => {
    render(<AppError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("logs the error", () => {
    const error = new Error("boom");
    render(<AppError error={error} reset={vi.fn()} />);
    expect(console.error).toHaveBeenCalledWith(error);
  });

  it("calls reset when the retry button is clicked", () => {
    const reset = vi.fn();
    render(<AppError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
