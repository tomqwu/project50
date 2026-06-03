import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  afterEach(() => cleanup());

  it("renders the title", () => {
    render(<EmptyState title="Nothing here" />);
    expect(
      screen.getByRole("heading", { name: "Nothing here" }),
    ).toBeInTheDocument();
  });

  it("renders the optional message when provided", () => {
    render(<EmptyState title="Nothing here" message="Add something first." />);
    expect(screen.getByText("Add something first.")).toBeInTheDocument();
  });

  it("omits the message when not provided", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.queryByText("Add something first.")).not.toBeInTheDocument();
  });

  it("renders the optional action node", () => {
    render(
      <EmptyState title="Nothing here" action={<button>Do it</button>} />,
    );
    expect(screen.getByRole("button", { name: "Do it" })).toBeInTheDocument();
  });

  it("does not render an action wrapper when no action is provided", () => {
    render(<EmptyState title="Nothing here" message="msg" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
