import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TermsOfServicePage, { metadata } from "./page";

describe("Terms of Service page", () => {
  afterEach(() => cleanup());

  it("exposes a page title in metadata", () => {
    expect(metadata.title).toBe("Terms of Service — Project 50");
  });

  it("renders the Terms of Service heading", () => {
    render(<TermsOfServicePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Terms of Service" }),
    ).toBeInTheDocument();
  });

  it("uses Project 50 as the entity name and does not render draft TODOs", () => {
    const { container } = render(<TermsOfServicePage />);
    expect(screen.getAllByText(/Project 50/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/TODO/);
    expect(container.textContent).not.toMatch(/DRAFT/i);
  });

  it("covers the substantive sections", () => {
    const { container } = render(<TermsOfServicePage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Eligibility/i);
    expect(text).toMatch(/The Project 50 program/i);
    expect(text).toMatch(/User content/i);
    expect(text).toMatch(/Acceptable use/i);
    expect(text).toMatch(/Limitation of liability/i);
    expect(text).toMatch(/Contact/i);
  });

  it("links to the privacy and data-deletion pages", () => {
    render(<TermsOfServicePage />);
    expect(
      screen.getByRole("link", { name: /Privacy Policy/i }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByRole("link", { name: /how to delete your data/i }),
    ).toHaveAttribute("href", "/data-deletion");
  });

  it("lists the contact email", () => {
    render(<TermsOfServicePage />);
    const link = screen.getByRole("link", { name: "privacy@project50.fit" });
    expect(link).toHaveAttribute("href", "mailto:privacy@project50.fit");
  });
});
