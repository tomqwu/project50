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

/** Build a minimal fetch stub that returns a blob for the day image. */
function stubImageFetch() {
  const blob = new Blob(["png-bytes"], { type: "image/png" });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => blob,
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, blob };
}

describe("ShareDayButton — structure", () => {
  it("renders the generic 'Share Day N' control plus explicit FB / IG / copy buttons", () => {
    render(<ShareDayButton shareId="abc" dayNumber={7} />);
    expect(screen.getByTestId("share-day-button")).toHaveTextContent("Share Day 7");
    expect(screen.getByTestId("share-facebook-button")).toBeInTheDocument();
    expect(screen.getByTestId("share-instagram-button")).toBeInTheDocument();
    expect(screen.getByTestId("copy-day-link-button")).toBeInTheDocument();
  });

  it("gives the explicit buttons descriptive aria-labels", () => {
    render(<ShareDayButton shareId="abc" dayNumber={4} />);
    expect(screen.getByTestId("share-facebook-button")).toHaveAttribute(
      "aria-label",
      "Share Day 4 on Facebook",
    );
    expect(screen.getByTestId("share-instagram-button")).toHaveAttribute(
      "aria-label",
      "Share Day 4 on Instagram",
    );
  });
});

describe("ShareDayButton — shareInstagram kill-switch (#285)", () => {
  it("renders the Instagram button when instagramEnabled is true (default)", () => {
    render(<ShareDayButton shareId="abc" dayNumber={7} />);
    expect(screen.getByTestId("share-instagram-button")).toBeInTheDocument();
  });

  it("renders the Instagram button when instagramEnabled is explicitly true", () => {
    render(<ShareDayButton shareId="abc" dayNumber={7} instagramEnabled />);
    expect(screen.getByTestId("share-instagram-button")).toBeInTheDocument();
  });

  it("omits the Instagram button when instagramEnabled is false", () => {
    render(<ShareDayButton shareId="abc" dayNumber={7} instagramEnabled={false} />);
    expect(screen.queryByTestId("share-instagram-button")).not.toBeInTheDocument();
    // No IG fallback either.
    expect(screen.queryByTestId("instagram-fallback")).not.toBeInTheDocument();
  });

  it("keeps Facebook, copy, and native share when Instagram is disabled", () => {
    render(<ShareDayButton shareId="abc" dayNumber={7} instagramEnabled={false} />);
    expect(screen.getByTestId("share-day-button")).toBeInTheDocument();
    expect(screen.getByTestId("share-facebook-button")).toBeInTheDocument();
    expect(screen.getByTestId("copy-day-link-button")).toBeInTheDocument();
  });
});

describe("ShareDayButton — generic native share", () => {
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
});

describe("ShareDayButton — explicit Facebook", () => {
  it("opens the Facebook sharer popup for the day URL", () => {
    vi.stubGlobal("navigator", {});
    const open = vi.fn();
    vi.stubGlobal("open", open);

    render(<ShareDayButton shareId="abc" dayNumber={8} />);
    fireEvent.click(screen.getByTestId("share-facebook-button"));

    expect(open).toHaveBeenCalledWith(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${ORIGIN}/c/abc/day/8`)}`,
      "_blank",
      "noopener,width=600,height=600",
    );
  });
});

describe("ShareDayButton — explicit Instagram (image-based, honest)", () => {
  it("fetches the day card image and shares it via navigator.share({ files }) when file-share is supported", async () => {
    const { fetchMock } = stubImageFetch();
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    render(<ShareDayButton shareId="abc" dayNumber={12} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));

    await waitFor(() => expect(share).toHaveBeenCalled());

    // Fetched the per-day OG image.
    expect(fetchMock).toHaveBeenCalledWith(`${ORIGIN}/c/abc/day/12/opengraph-image`);

    // canShare was consulted with a files payload (capability probe).
    const probe = canShare.mock.calls[0]![0] as { files: File[] };
    expect(Array.isArray(probe.files)).toBe(true);
    expect(probe.files[0]).toBeInstanceOf(File);

    // share() received a File.
    const shared = share.mock.calls[0]![0] as { files: File[] };
    expect(shared.files[0]).toBeInstanceOf(File);
    expect(shared.files[0]!.type).toBe("image/png");
  });

  it("does NOT claim a successful share (no fake 'Posted to Instagram') after sharing the image", async () => {
    stubImageFetch();
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    render(<ShareDayButton shareId="abc" dayNumber={12} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByText(/posted to instagram/i)).not.toBeInTheDocument();
  });

  it("shows the honest fallback (no fake success) on desktop / when file-share is unsupported", async () => {
    // No canShare, no share → cannot share an image to IG from this browser.
    vi.stubGlobal("navigator", {});

    render(<ShareDayButton shareId="abc" dayNumber={6} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));

    const note = await screen.findByTestId("instagram-fallback");
    expect(note).toHaveTextContent(/can't share a link from the web/i);
    // Honest fallback exposes copy + save-image actions.
    expect(screen.getByTestId("instagram-copy-link")).toBeInTheDocument();
    expect(screen.getByTestId("instagram-save-image")).toBeInTheDocument();
    expect(screen.queryByText(/posted to instagram/i)).not.toBeInTheDocument();
  });

  it("falls back honestly when canShare reports files are not shareable", async () => {
    stubImageFetch();
    const share = vi.fn();
    const canShare = vi.fn().mockReturnValue(false);
    vi.stubGlobal("navigator", { share, canShare });

    render(<ShareDayButton shareId="abc" dayNumber={6} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));

    expect(await screen.findByTestId("instagram-fallback")).toBeInTheDocument();
    // Never attempted a share that we knew would fail.
    expect(share).not.toHaveBeenCalled();
  });

  it("falls back honestly when the image response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, blob: async () => null });
    vi.stubGlobal("fetch", fetchMock);
    const share = vi.fn();
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    render(<ShareDayButton shareId="abc" dayNumber={6} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));

    expect(await screen.findByTestId("instagram-fallback")).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();
  });

  it("defaults the shared file type to image/png when the blob has no type", async () => {
    const blob = new Blob(["png-bytes"]); // no type
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    render(<ShareDayButton shareId="abc" dayNumber={6} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));

    await waitFor(() => expect(share).toHaveBeenCalled());
    const shared = share.mock.calls[0]![0] as { files: File[] };
    expect(shared.files[0]!.type).toBe("image/png");
  });

  it("falls back honestly when the image fetch fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    const share = vi.fn();
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    render(<ShareDayButton shareId="abc" dayNumber={6} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));

    expect(await screen.findByTestId("instagram-fallback")).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();
  });

  it("falls back honestly (no fake success) when the user dismisses the share sheet", async () => {
    stubImageFetch();
    const share = vi.fn().mockRejectedValue(new Error("AbortError"));
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    render(<ShareDayButton shareId="abc" dayNumber={6} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));

    expect(await screen.findByTestId("instagram-fallback")).toBeInTheDocument();
    expect(screen.queryByText(/posted to instagram/i)).not.toBeInTheDocument();
  });

  it("honest fallback 'Copy link' copies the day URL", async () => {
    vi.stubGlobal("navigator", {});

    render(<ShareDayButton shareId="abc" dayNumber={6} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));
    await screen.findByTestId("instagram-fallback");

    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    fireEvent.click(screen.getByTestId("instagram-copy-link"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/c/abc/day/6`));
  });

  it("honest fallback 'Save image' opens the day card image URL", async () => {
    vi.stubGlobal("navigator", {});

    render(<ShareDayButton shareId="abc" dayNumber={6} />);
    fireEvent.click(screen.getByTestId("share-instagram-button"));
    await screen.findByTestId("instagram-fallback");

    const open = vi.fn();
    vi.stubGlobal("open", open);
    fireEvent.click(screen.getByTestId("instagram-save-image"));

    expect(open).toHaveBeenCalledWith(
      `${ORIGIN}/c/abc/day/6/opengraph-image`,
      "_blank",
      "noopener",
    );
  });

  it("ignores re-entrant Instagram clicks while a share is pending", async () => {
    stubImageFetch();
    let resolveShare: () => void = () => {};
    const share = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveShare = resolve;
        }),
    );
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    render(<ShareDayButton shareId="abc" dayNumber={6} />);
    const btn = screen.getByTestId("share-instagram-button");
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    resolveShare();
  });
});

describe("ShareDayButton — copy link", () => {
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
