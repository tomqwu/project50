import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import WelcomePage from "./page";

afterEach(() => {
  cleanup();
});

describe("WelcomePage", () => {
  it("renders the welcome explainer with the headline and CTA to '/'", () => {
    render(<WelcomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/project 50/i);
    expect(screen.getByTestId("welcome-cta")).toHaveAttribute("href", "/");
  });

  it("renders all 7 rule titles via the explainer", () => {
    render(<WelcomePage />);
    expect(screen.getByText("Wake up before 8 AM")).toBeInTheDocument();
    expect(screen.getByText("Track progress")).toBeInTheDocument();
  });
});
