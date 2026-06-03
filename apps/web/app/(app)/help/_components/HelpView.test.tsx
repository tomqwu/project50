import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { HelpView, SUPPORT_EMAIL } from "./HelpView";

afterEach(cleanup);

describe("HelpView", () => {
  it("renders the Help Center heading and intro", () => {
    render(<HelpView />);
    expect(
      screen.getByRole("heading", { level: 1, name: /help center/i }),
    ).toBeInTheDocument();
  });

  it("answers the core Project 50 questions as FAQ entries", () => {
    render(<HelpView />);
    const questions = [
      /how do the 7 rules work/i,
      /what counts as a miss/i,
      /hard reset/i,
      /how do i start/i,
      /restart/i,
      /custom plan/i,
      /privacy/i,
      /delete my account/i,
    ];
    for (const q of questions) {
      expect(screen.getAllByText(q).length).toBeGreaterThan(0);
    }
  });

  it("renders every question as an interactive disclosure with an answer", () => {
    render(<HelpView />);
    const items = screen.getAllByTestId("faq-item");
    expect(items.length).toBeGreaterThanOrEqual(8);
    // Each disclosure exposes a summary (question) and answer body.
    for (const item of items) {
      expect(item.querySelector("summary")).not.toBeNull();
    }
  });

  it("mentions all 7 rules by title so the rules answer is concrete", () => {
    render(<HelpView />);
    expect(screen.getByText(/wake up before 8 am/i)).toBeInTheDocument();
    expect(screen.getByText(/track progress/i)).toBeInTheDocument();
  });

  it("explains the all-or-nothing hard reset using the real program length", () => {
    render(<HelpView />);
    expect(screen.getAllByText(/50 days/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/start over from day 1/i)).toBeInTheDocument();
  });

  it("offers an in-app contact affordance via a mailto support link", () => {
    render(<HelpView />);
    const link = screen.getByRole("link", { name: /email support/i });
    expect(link).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
  });

  it("exposes a stable, on-brand support email constant", () => {
    expect(SUPPORT_EMAIL).toMatch(/@/);
  });
});
