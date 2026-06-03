import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
  afterEach(() => cleanup());

  it("renders default title and message", () => {
    render(<ErrorState />);
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("An unexpected error occurred. Please try again."),
    ).toBeInTheDocument();
  });

  it("renders custom title and message", () => {
    render(<ErrorState title="Boom" message="It broke" />);
    expect(screen.getByRole("heading", { name: "Boom" })).toBeInTheDocument();
    expect(screen.getByText("It broke")).toBeInTheDocument();
  });

  it("renders as an alert region", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("omits the message when explicitly empty", () => {
    render(<ErrorState message="" />);
    expect(
      screen.queryByText("An unexpected error occurred. Please try again."),
    ).not.toBeInTheDocument();
  });

  it("does not render a retry button without onRetry", () => {
    render(<ErrorState />);
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });

  it("renders a retry button that calls onRetry when clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
