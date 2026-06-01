import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the app name and core version", () => {
    render(<HomePage />);
    expect(screen.getByTestId("home")).toHaveTextContent("project50 v0.0.0");
  });
});
