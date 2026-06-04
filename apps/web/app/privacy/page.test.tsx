import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PrivacyPolicyPage, { metadata } from "./page";

describe("Privacy Policy page", () => {
  afterEach(() => cleanup());

  it("exposes a page title in metadata", () => {
    expect(metadata.title).toBe("Privacy Policy — Project 50");
  });

  it("renders the Privacy Policy heading", () => {
    render(<PrivacyPolicyPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeInTheDocument();
  });

  it("uses Project 50 as the entity name and does not render draft TODOs", () => {
    const { container } = render(<PrivacyPolicyPage />);
    expect(screen.getAllByText(/Project 50/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/TODO/);
    expect(container.textContent).not.toMatch(/DRAFT/i);
  });

  it("lists the privacy contact email", () => {
    render(<PrivacyPolicyPage />);
    const links = screen.getAllByRole("link", {
      name: "privacy@project50.fit",
    });
    expect(links[0]).toHaveAttribute("href", "mailto:privacy@project50.fit");
  });

  it("covers the substantive sections", () => {
    const { container } = render(<PrivacyPolicyPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Data we collect/i);
    expect(text).toMatch(/How we use your data/i);
    expect(text).toMatch(/How we share data/i);
    expect(text).toMatch(/Data retention/i);
    expect(text).toMatch(/Your rights/i);
    expect(text).toMatch(/Contact/i);
  });

  it("links to the data-deletion page", () => {
    render(<PrivacyPolicyPage />);
    const link = screen.getByRole("link", { name: /how to delete your data/i });
    expect(link).toHaveAttribute("href", "/data-deletion");
  });

  it("discloses the email magic-link sign-in and that the email is stored", () => {
    const { container } = render(<PrivacyPolicyPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/email magic link/i);
    expect(text).toMatch(/store the email address you submit/i);
  });

  it("discloses Stripe as the payment processor", () => {
    const { container } = render(<PrivacyPolicyPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Stripe/);
    expect(text).toMatch(/payment processing/i);
    expect(text).toMatch(/full card details/i);
  });

  it("describes media deletion from object storage without over-promising", () => {
    const { container } = render(<PrivacyPolicyPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/uploaded media from our object storage/i);
    expect(text).toMatch(/backups/i);
  });
});
