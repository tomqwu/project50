import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LegalPage } from "./LegalPage";

describe("LegalPage", () => {
  afterEach(() => cleanup());

  it("renders the title as the single h1", () => {
    render(
      <LegalPage title="My Policy" lastUpdated="June 4, 2026">
        <p>body</p>
      </LegalPage>,
    );
    const h1 = screen.getByRole("heading", { level: 1, name: "My Policy" });
    expect(h1).toBeInTheDocument();
  });

  it("renders the last-updated line", () => {
    render(
      <LegalPage title="T" lastUpdated="June 4, 2026">
        <p>body</p>
      </LegalPage>,
    );
    expect(screen.getByText("Last updated: June 4, 2026")).toBeInTheDocument();
  });

  it("renders an effective date when provided", () => {
    render(
      <LegalPage title="T" lastUpdated="June 4, 2026" effectiveDate="June 1, 2026">
        <p>body</p>
      </LegalPage>,
    );
    expect(
      screen.getByText("Effective date: June 1, 2026"),
    ).toBeInTheDocument();
  });

  it("omits the effective date line when not provided", () => {
    render(
      <LegalPage title="T" lastUpdated="June 4, 2026">
        <p>body</p>
      </LegalPage>,
    );
    expect(screen.queryByText(/Effective date:/)).not.toBeInTheDocument();
  });

  it("renders its children", () => {
    render(
      <LegalPage title="T" lastUpdated="June 4, 2026">
        <p>hello world child</p>
      </LegalPage>,
    );
    expect(screen.getByText("hello world child")).toBeInTheDocument();
  });

  it("links back to the home page", () => {
    render(
      <LegalPage title="T" lastUpdated="June 4, 2026">
        <p>body</p>
      </LegalPage>,
    );
    const link = screen.getByRole("link", { name: /Project 50/ });
    expect(link).toHaveAttribute("href", "/");
  });
});
