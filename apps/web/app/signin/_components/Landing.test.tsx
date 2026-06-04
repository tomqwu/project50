import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock next-auth/react used by SignInButtons (child of Landing)
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { PROJECT50_RULES } from "@project50/core";

import { Landing } from "./Landing";

describe("Landing", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the project50 hero heading with data-testid='home' containing 'project50'", () => {
    render(<Landing />);
    const heading = screen.getByTestId("home");
    expect(heading.tagName).toBe("H1");
    expect(heading).toHaveTextContent("project50");
  });

  it("renders the value proposition selling 7 rules / 50 days / all-or-nothing", () => {
    render(<Landing />);
    const valueProp = screen.getByTestId("landing-value-prop");
    expect(valueProp).toHaveTextContent("7 rules");
    expect(valueProp).toHaveTextContent("50 days");
    expect(valueProp).toHaveTextContent(/all[- ]or[- ]nothing/i);
  });

  it("renders a primary hero CTA that links to /welcome", () => {
    render(<Landing />);
    const cta = screen.getByTestId("landing-hero-cta");
    expect(cta).toHaveAttribute("href", "/welcome");
    expect(cta).toHaveTextContent(/how it works|see the rules|how project 50 works/i);
  });

  it("renders the 'How it works' 3-step strip", () => {
    render(<Landing />);
    const how = screen.getByTestId("landing-how-it-works-strip");
    expect(how).toHaveTextContent(/how it works/i);
    const steps = screen.getAllByTestId("landing-step");
    expect(steps).toHaveLength(3);
    // Concrete copy about the program flow.
    expect(how).toHaveTextContent(/all 7 rules/i);
    expect(how).toHaveTextContent(/day 1/i);
  });

  it("renders a benefits grid with four concrete benefits", () => {
    render(<Landing />);
    const grid = screen.getByTestId("landing-benefits");
    const benefits = screen.getAllByTestId("landing-benefit");
    expect(benefits).toHaveLength(4);
    expect(grid).toHaveTextContent(/streak/i);
    expect(grid).toHaveTextContent(/photo/i);
    expect(grid).toHaveTextContent(/recap/i);
  });

  it("renders Google and Facebook sign-in buttons", () => {
    render(<Landing />);
    expect(screen.getByTestId("signin-google")).toBeInTheDocument();
    expect(screen.getByTestId("signin-facebook")).toBeInTheDocument();
  });

  it("does NOT render e2e button when e2eEnabled is false (default)", () => {
    render(<Landing />);
    expect(screen.queryByTestId("signin-e2e")).toBeNull();
  });

  it("renders e2e button when e2eEnabled is true", () => {
    render(<Landing e2eEnabled />);
    expect(screen.getByTestId("signin-e2e")).toBeInTheDocument();
  });

  it("does NOT render the email form when emailEnabled is false (default)", () => {
    render(<Landing />);
    expect(screen.queryByTestId("signin-email-form")).toBeNull();
  });

  it("renders the email form when emailEnabled is true", () => {
    render(<Landing emailEnabled />);
    expect(screen.getByTestId("signin-email-form")).toBeInTheDocument();
  });

  it("renders the full list of all 7 daily rules from core", () => {
    render(<Landing />);
    const rules = screen.getByTestId("landing-rules");
    expect(rules).toHaveTextContent(/7 daily rules/i);
    PROJECT50_RULES.forEach((rule) => {
      expect(rules).toHaveTextContent(rule.title);
    });
    expect(screen.getAllByTestId("landing-rule")).toHaveLength(7);
  });

  it("renders the inline app preview with the Day 1 / 50 header", () => {
    render(<Landing />);
    const preview = screen.getByTestId("landing-app-preview");
    expect(preview).toHaveTextContent(/Day 1 \/ 50/i);
  });

  it("renders a 'How Project 50 works' link to /welcome in the sign-in card", () => {
    render(<Landing />);
    const link = screen.getByTestId("landing-how-it-works");
    expect(link).toHaveAttribute("href", "/welcome");
    expect(link).toHaveTextContent(/how project 50 works/i);
  });
});
