import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BillingSection } from "./BillingSection";

afterEach(() => cleanup());

describe("BillingSection", () => {
  it("renders a heading and links to the upgrade page", () => {
    render(<BillingSection />);
    expect(screen.getByText(/plan & billing/i)).toBeInTheDocument();
    const link = screen.getByTestId("manage-plan-link");
    expect(link).toHaveAttribute("href", "/upgrade");
    expect(link).toHaveTextContent(/manage plan/i);
  });
});
