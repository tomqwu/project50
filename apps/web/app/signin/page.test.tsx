import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock next-auth/react used by SignInButtons (via Landing)
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import SignInPage from "./page";

describe("SignInPage", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    cleanup();
  });

  it("renders the project50 heading with data-testid='home'", () => {
    render(<SignInPage />);
    expect(screen.getByTestId("home")).toHaveTextContent("project50");
  });

  it("renders Google and Facebook buttons", () => {
    render(<SignInPage />);
    expect(screen.getByTestId("signin-google")).toBeInTheDocument();
    expect(screen.getByTestId("signin-facebook")).toBeInTheDocument();
  });

  it("does NOT render e2e button when AUTH_E2E is not '1'", () => {
    delete process.env.AUTH_E2E;
    render(<SignInPage />);
    expect(screen.queryByTestId("signin-e2e")).toBeNull();
  });

  it("renders e2e button when AUTH_E2E === '1'", () => {
    process.env.AUTH_E2E = "1";
    render(<SignInPage />);
    expect(screen.getByTestId("signin-e2e")).toBeInTheDocument();
  });

  it("renders the value proposition", () => {
    render(<SignInPage />);
    expect(screen.getByTestId("landing-value-prop")).toHaveTextContent(
      "50 days",
    );
  });

  it("renders the how-it-works strip and benefits grid", () => {
    render(<SignInPage />);
    expect(
      screen.getByTestId("landing-how-it-works-strip"),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("landing-step")).toHaveLength(3);
    const benefits = screen.getByTestId("landing-benefits");
    expect(benefits).toHaveTextContent("Daily photo log");
    expect(screen.getAllByTestId("landing-benefit")).toHaveLength(4);
  });
});
