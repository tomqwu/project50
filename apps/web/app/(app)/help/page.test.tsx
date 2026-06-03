import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("./_components/HelpView", () => ({
  HelpView: () => <div data-testid="help-view">help</div>,
}));

import HelpPage from "./page";

afterEach(cleanup);

describe("HelpPage", () => {
  it("renders the Help Center view", () => {
    render(<HelpPage />);
    expect(screen.getByTestId("help-view")).toBeInTheDocument();
  });
});
