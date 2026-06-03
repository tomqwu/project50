import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PROJECT50_RULES } from "@project50/core";
import { WelcomeExplainer } from "./WelcomeExplainer";

afterEach(() => {
  cleanup();
});

describe("WelcomeExplainer", () => {
  it("renders the Project 50 headline", () => {
    render(<WelcomeExplainer />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/project 50/i);
  });

  it("renders all 7 rule titles", () => {
    render(<WelcomeExplainer />);
    expect(PROJECT50_RULES).toHaveLength(7);
    for (const rule of PROJECT50_RULES) {
      expect(screen.getByText(rule.title)).toBeInTheDocument();
    }
  });

  it("explains the 50-day all-or-nothing rule", () => {
    render(<WelcomeExplainer />);
    const copy = screen.getByTestId("welcome-all-or-nothing");
    expect(copy).toHaveTextContent(/50 days/i);
    expect(copy).toHaveTextContent(/all-or-nothing/i);
    expect(copy).toHaveTextContent(/day 1/i);
  });

  it("renders a primary CTA linking to the dashboard at '/'", () => {
    render(<WelcomeExplainer />);
    const cta = screen.getByTestId("welcome-cta");
    expect(cta).toHaveAttribute("href", "/");
    expect(cta).toHaveTextContent(/start project 50/i);
  });
});
