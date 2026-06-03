import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import FeedLoading from "./loading";

describe("feed loading boundary", () => {
  afterEach(() => cleanup());

  it("renders a spinner", () => {
    render(<FeedLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });
});
