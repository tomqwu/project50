import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

import { DataExportSection } from "./DataExportSection";

function downloadButton() {
  return screen.getByRole("button", { name: /download my data|preparing/i });
}

beforeEach(() => {
  // Stub the object-URL APIs jsdom doesn't implement.
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DataExportSection", () => {
  it("renders the heading and download affordance", () => {
    render(<DataExportSection />);
    expect(screen.getByText(/your data/i)).toBeInTheDocument();
    expect(downloadButton()).toBeEnabled();
  });

  it("downloads the export file on click", async () => {
    const blob = new Blob([JSON.stringify({ ok: true })], {
      type: "application/json",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(blob) });
    vi.stubGlobal("fetch", fetchMock);

    const clickSpy = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(<DataExportSection />);
    fireEvent.click(downloadButton());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/account/export", {
        method: "GET",
      });
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
    // Button re-enabled after completion.
    await waitFor(() => expect(downloadButton()).toBeEnabled());
  });

  it("shows a 'Preparing…' state while the download is in flight", async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValue(new Promise((r) => (resolveFetch = r)));
    vi.stubGlobal("fetch", fetchMock);

    render(<DataExportSection />);
    fireEvent.click(downloadButton());

    await waitFor(() => {
      expect(downloadButton()).toBeDisabled();
      expect(downloadButton()).toHaveTextContent(/preparing/i);
    });
    // Ignore a second click while in flight.
    fireEvent.click(downloadButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, blob: vi.fn().mockResolvedValue(new Blob()) });
    await waitFor(() => expect(downloadButton()).toBeEnabled());
  });

  it("shows an error when the request fails (non-ok response)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<DataExportSection />);
    fireEvent.click(downloadButton());

    await waitFor(() => {
      expect(screen.getByTestId("export-error")).toHaveTextContent(
        /something went wrong/i,
      );
    });
    expect(downloadButton()).toBeEnabled();
  });

  it("shows an error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(<DataExportSection />);
    fireEvent.click(downloadButton());

    await waitFor(() => {
      expect(screen.getByTestId("export-error")).toHaveTextContent(
        /something went wrong/i,
      );
    });
  });
});
