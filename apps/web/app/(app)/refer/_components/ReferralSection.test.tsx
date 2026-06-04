import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

import { ReferralSection } from "./ReferralSection";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  Object.defineProperty(window, "location", {
    value: { origin: "https://app.test" },
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("ReferralSection", () => {
  it("renders the relative referral link", () => {
    render(<ReferralSection code="ABCD2345" referredCount={0} />);
    expect(screen.getByTestId("referral-link")).toHaveTextContent(
      "/?ref=ABCD2345",
    );
  });

  it("renders a zero/plural referral count", () => {
    render(<ReferralSection code="ABCD2345" referredCount={0} />);
    expect(screen.getByTestId("referral-count")).toHaveTextContent(
      "You've referred 0 people.",
    );
  });

  it("renders the singular count for one referral", () => {
    render(<ReferralSection code="ABCD2345" referredCount={1} />);
    expect(screen.getByTestId("referral-count")).toHaveTextContent(
      "You've referred 1 person.",
    );
  });

  it("copies the absolute link to the clipboard and shows feedback", async () => {
    render(<ReferralSection code="ABCD2345" referredCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://app.test/?ref=ABCD2345",
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("reverts the copied label after the timeout", async () => {
    vi.useFakeTimers();
    render(<ReferralSection code="ABCD2345" referredCount={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    // Let the awaited clipboard promise resolve, then advance the timer.
    await vi.runAllTimersAsync();

    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
  });
});
