import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock next-auth/react used by SignInButtons (child of Landing)
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

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

  it("renders the value proposition", () => {
    render(<Landing />);
    const valueProp = screen.getByTestId("landing-value-prop");
    expect(valueProp).toHaveTextContent("50-day challenge");
    expect(valueProp).toHaveTextContent("Track it daily");
    expect(valueProp).toHaveTextContent("Celebrate and share it");
  });

  it("renders all three feature bullets", () => {
    render(<Landing />);
    const features = screen.getByTestId("landing-features");
    expect(features).toHaveTextContent("50-day challenges + streaks");
    expect(features).toHaveTextContent("Log daily with photos");
    expect(features).toHaveTextContent("Shareable recap videos and cards");
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

  it("renders a 'How Project 50 works' link to /welcome", () => {
    render(<Landing />);
    const link = screen.getByTestId("landing-how-it-works");
    expect(link).toHaveAttribute("href", "/welcome");
    expect(link).toHaveTextContent(/how project 50 works/i);
  });
});
