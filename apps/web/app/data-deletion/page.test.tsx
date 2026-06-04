import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DataDeletionPage, { metadata } from "./page";

describe("Data Deletion page", () => {
  afterEach(() => cleanup());

  it("exposes a page title in metadata", () => {
    expect(metadata.title).toBe("Data Deletion — Project 50");
  });

  it("renders the deletion heading", () => {
    render(<DataDeletionPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "How to delete your data" }),
    ).toBeInTheDocument();
  });

  it("points users to Settings → Delete Account", () => {
    const { container } = render(<DataDeletionPage />);
    expect(container.textContent).toMatch(/Settings → Delete Account/);
  });

  it("describes the email fallback with the privacy address", () => {
    render(<DataDeletionPage />);
    const link = screen.getByRole("link", { name: "privacy@project50.fit" });
    expect(link).toHaveAttribute("href", "mailto:privacy@project50.fit");
  });

  it("lists what gets deleted", () => {
    const { container } = render(<DataDeletionPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/What gets deleted/i);
    expect(text).toMatch(/challenges/i);
    expect(text).toMatch(/follows/i);
    expect(text).toMatch(/media/i);
  });

  it("links to the privacy policy", () => {
    render(<DataDeletionPage />);
    expect(
      screen.getByRole("link", { name: /Privacy Policy/i }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("does not render draft TODOs", () => {
    const { container } = render(<DataDeletionPage />);
    expect(container.textContent).not.toMatch(/TODO/);
  });

  it("describes media removal from object storage and backup retention", () => {
    const { container } = render(<DataDeletionPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/from our object storage/i);
    expect(text).toMatch(/backups/i);
  });
});
