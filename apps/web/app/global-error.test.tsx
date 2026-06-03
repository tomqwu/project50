import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import GlobalError from "./global-error";

describe("global-error boundary", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a fallback message", () => {
    render(<GlobalError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("reports the error to Sentry", () => {
    const error = new Error("boom");
    render(<GlobalError error={error} reset={vi.fn()} />);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("calls reset when the retry button is clicked", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
