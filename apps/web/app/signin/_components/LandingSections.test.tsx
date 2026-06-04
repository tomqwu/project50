import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { PROJECT50_RULES } from "@project50/core";

import { RulesShowcase, AppPreview } from "./LandingSections";

describe("RulesShowcase", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a clearly-titled '7 daily rules' section", () => {
    render(<RulesShowcase />);
    const section = screen.getByTestId("landing-rules");
    expect(section).toHaveTextContent(/7 daily rules/i);
  });

  it("renders ALL 7 rules from PROJECT50_RULES (single source of truth)", () => {
    render(<RulesShowcase />);
    const items = screen.getAllByTestId("landing-rule");
    expect(items).toHaveLength(7);
    expect(items).toHaveLength(PROJECT50_RULES.length);
  });

  it("shows each rule's title and detail, numbered 1-7", () => {
    render(<RulesShowcase />);
    const items = screen.getAllByTestId("landing-rule");
    PROJECT50_RULES.forEach((rule, i) => {
      const item = items[i];
      expect(item).toHaveTextContent(rule.title);
      expect(item).toHaveTextContent(rule.detail);
      expect(item).toHaveTextContent(String(rule.id));
    });
  });

  it("renders the rules as a semantic ordered list of list items", () => {
    render(<RulesShowcase />);
    const section = screen.getByTestId("landing-rules");
    const list = within(section).getByRole("list");
    expect(list.tagName).toBe("OL");
    const listItems = within(list).getAllByRole("listitem");
    expect(listItems).toHaveLength(7);
  });

  it("uses a real heading for the section title", () => {
    render(<RulesShowcase />);
    const heading = screen.getByRole("heading", { name: /7 daily rules/i });
    expect(heading.tagName).toBe("H2");
  });
});

describe("AppPreview", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an inline app preview (no <img>/screenshot)", () => {
    const { container } = render(<AppPreview />);
    expect(screen.getByTestId("landing-app-preview")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the day header 'Day 1 / 50'", () => {
    render(<AppPreview />);
    const preview = screen.getByTestId("landing-app-preview");
    expect(preview).toHaveTextContent(/Day 1 \/ 50/i);
  });

  it("renders rule rows from PROJECT50_RULES with at least one checked", () => {
    render(<AppPreview />);
    const rows = screen.getAllByTestId("landing-preview-rule");
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const checked = screen.getAllByTestId("landing-preview-rule-checked");
    expect(checked.length).toBeGreaterThanOrEqual(1);
    expect(checked.length).toBeLessThan(rows.length);
  });

  it("is decorative for screen readers via aria-hidden checkmarks", () => {
    const { container } = render(<AppPreview />);
    const marks = container.querySelectorAll('[aria-hidden="true"]');
    expect(marks.length).toBeGreaterThanOrEqual(1);
  });
});
