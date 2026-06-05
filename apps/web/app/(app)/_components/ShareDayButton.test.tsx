import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ShareDayButton } from "./ShareDayButton";

const ORIGIN = "https://www.project50.fit";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // jsdom has no window.location.origin override needed — default is
  // http://localhost. Stub it so the share URL is deterministic.
  vi.stubGlobal("location", { origin: ORIGIN });
});

describe("ShareDayButton", () => {
  it("renders a 'Share Day N' control", () => {
    render(<ShareDayButton shareId="abc" dayNumber={7} />);
    expect(screen.getByTestId("share-day-button")).toHaveTextContent("Share Day 7");
  });

  it("uses navigator.share with the day URL when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    render(<ShareDayButton shareId="abc" dayNumber={3} />);
    fireEvent.click(screen.getByTestId("share-day-button"));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ url: `${ORIGIN}/c/abc/day/3` }),
    );
  });

  it("opens the Facebook sharer popup when navigator.share is unavailable", () => {
    vi.stubGlobal("navigator", {});
    const open = vi.fn();
    vi.stubGlobal("open", open);

    render(<ShareDayButton shareId="abc" dayNumber={5} />);
    fireEvent.click(screen.getByTestId("share-day-button"));

    expect(open).toHaveBeenCalledWith(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${ORIGIN}/c/abc/day/5`)}`,
      "_blank",
      "noopener,width=600,height=600",
    );
  });

  it("falls back to the FB sharer when navigator.share rejects", async () => {
    const share = vi.fn().mockRejectedValue(new Error("user cancelled"));
    vi.stubGlobal("navigator", { share });
    const open = vi.fn();
    vi.stubGlobal("open", open);

    render(<ShareDayButton shareId="abc" dayNumber={9} />);
    fireEvent.click(screen.getByTestId("share-day-button"));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining("facebook.com/sharer"),
        "_blank",
        expect.any(String),
      ),
    );
  });

  it("copy-link fallback writes the day URL to the clipboard and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<ShareDayButton shareId="abc" dayNumber={2} />);
    fireEvent.click(screen.getByTestId("copy-day-link-button"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/c/abc/day/2`));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("shows an error when the clipboard copy fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<ShareDayButton shareId="abc" dayNumber={2} />);
    fireEvent.click(screen.getByTestId("copy-day-link-button"));

    expect(await screen.findByText("Copy failed")).toBeInTheDocument();
  });

  it("does nothing destructive when no clipboard API exists on copy", async () => {
    vi.stubGlobal("navigator", {});

    render(<ShareDayButton shareId="abc" dayNumber={2} />);
    fireEvent.click(screen.getByTestId("copy-day-link-button"));

    // No throw, and it surfaces a copy-failed state rather than crashing.
    expect(await screen.findByText("Copy failed")).toBeInTheDocument();
  });
});
