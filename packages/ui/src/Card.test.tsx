import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card><p>hello</p></Card>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders as article by default", () => {
    const { container } = render(<Card><span>content</span></Card>);
    const article = container.querySelector("article");
    expect(article).toBeInTheDocument();
  });

  it("accepts as prop to change element tag", () => {
    const { container } = render(<Card as="section"><span>inner</span></Card>);
    const el = container.querySelector("section");
    expect(el).toBeInTheDocument();
  });

  it("applies card background CSS variable", () => {
    const { container } = render(<Card><span>bg</span></Card>);
    const article = container.querySelector("article");
    const style = article?.getAttribute("style") ?? "";
    expect(style).toContain("var(--card)");
  });

  it("applies hairline border CSS variable", () => {
    const { container } = render(<Card><span>border</span></Card>);
    const article = container?.querySelector("article");
    const style = article?.getAttribute("style") ?? "";
    expect(style).toContain("var(--hairline)");
  });

  it("has border-radius style", () => {
    const { container } = render(<Card><span>rounded</span></Card>);
    const article = container.querySelector("article");
    expect(article).toHaveStyle({ borderRadius: "18px" });
  });

  it("has padding style", () => {
    const { container } = render(<Card><span>padded</span></Card>);
    const article = container.querySelector("article");
    const style = article?.getAttribute("style") ?? "";
    expect(style).toContain("padding");
  });

  it("renders multiple children", () => {
    render(
      <Card>
        <p>first</p>
        <p>second</p>
      </Card>
    );
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("forwards data-testid", () => {
    render(
      <Card data-testid="panel">
        <span>x</span>
      </Card>
    );
    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });

  it("forwards arbitrary rest props (e.g. id, aria-label)", () => {
    const { container } = render(
      <Card id="profile-card" aria-label="Profile">
        <span>y</span>
      </Card>
    );
    const article = container.querySelector("article");
    expect(article).toHaveAttribute("id", "profile-card");
    expect(article).toHaveAttribute("aria-label", "Profile");
  });

  it("merges consumer className", () => {
    const { container } = render(
      <Card className="extra">
        <span>z</span>
      </Card>
    );
    const article = container.querySelector("article");
    expect(article?.className).toContain("extra");
  });

  it("merges consumer inline style with base styles", () => {
    const { container } = render(
      <Card style={{ marginTop: "12px" }}>
        <span>s</span>
      </Card>
    );
    const article = container.querySelector("article");
    expect(article).toHaveStyle({ marginTop: "12px" });
    expect(article).toHaveStyle({ borderRadius: "18px" });
  });
});
