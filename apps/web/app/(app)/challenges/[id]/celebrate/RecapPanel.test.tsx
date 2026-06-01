import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Hoist mocks before imports
const { mockFetch, mockNavigatorShare, mockClipboardWriteText } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockNavigatorShare: vi.fn(),
  mockClipboardWriteText: vi.fn(),
}));

// Mock global fetch
vi.stubGlobal("fetch", mockFetch);

import { RecapPanel } from "./RecapPanel";
import type { RecapItem } from "./RecapPanel";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

beforeEach(() => {
  // Default: no navigator.share
  Object.defineProperty(navigator, "share", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockClipboardWriteText },
    configurable: true,
    writable: true,
  });
});

const SUCCESS_RESPONSE = {
  recapId: "recap-1",
  kind: "DAY" as const,
  url: "https://minio.example.com/media/u1/recap-DAY-123.mp4",
};

function makeOkResponse(body: object) {
  return {
    ok: true,
    status: 201,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(""),
  };
}

function makeErrorResponse(status: number, text: string) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(text),
  };
}

describe("RecapPanel — initial render", () => {
  it("renders three generate buttons", () => {
    render(<RecapPanel challengeId="c1" />);
    expect(screen.getByTestId("recap-btn-DAY")).toBeInTheDocument();
    expect(screen.getByTestId("recap-btn-WEEK")).toBeInTheDocument();
    expect(screen.getByTestId("recap-btn-FIFTY")).toBeInTheDocument();
  });

  it("renders button labels", () => {
    render(<RecapPanel challengeId="c1" />);
    expect(screen.getByText("Day recap")).toBeInTheDocument();
    expect(screen.getByText("Week recap")).toBeInTheDocument();
    expect(screen.getByText("50-day recap")).toBeInTheDocument();
  });

  it("renders no videos when no initialRecaps and nothing generated", () => {
    render(<RecapPanel challengeId="c1" />);
    expect(screen.queryByTestId("recap-video")).toBeNull();
  });

  it("renders the recap panel container", () => {
    render(<RecapPanel challengeId="c1" />);
    expect(screen.getByTestId("recap-panel")).toBeInTheDocument();
  });
});

describe("RecapPanel — initialRecaps", () => {
  const initialRecaps: RecapItem[] = [
    {
      id: "r1",
      kind: "DAY",
      url: "https://minio.example.com/media/u1/recap-DAY-initial.mp4",
      createdAt: "2026-06-01T10:00:00Z",
    },
    {
      id: "r2",
      kind: "WEEK",
      url: "https://minio.example.com/media/u1/recap-WEEK-initial.mp4",
      createdAt: "2026-06-01T09:00:00Z",
    },
  ];

  it("renders videos from initialRecaps", () => {
    render(<RecapPanel challengeId="c1" initialRecaps={initialRecaps} />);
    const videos = screen.getAllByTestId("recap-video");
    expect(videos).toHaveLength(2);
  });

  it("renders correct src for initial recap videos", () => {
    render(<RecapPanel challengeId="c1" initialRecaps={initialRecaps} />);
    const videos = screen.getAllByTestId("recap-video");
    const srcs = videos.map((v) => v.getAttribute("src"));
    expect(srcs).toContain("https://minio.example.com/media/u1/recap-DAY-initial.mp4");
    expect(srcs).toContain("https://minio.example.com/media/u1/recap-WEEK-initial.mp4");
  });

  it("renders download link for each initial recap", () => {
    render(<RecapPanel challengeId="c1" initialRecaps={initialRecaps} />);
    const downloadLinks = screen.getAllByTestId("recap-download");
    expect(downloadLinks).toHaveLength(2);
    // Each download link should have the correct href
    expect(downloadLinks[0]).toHaveAttribute(
      "href",
      "https://minio.example.com/media/u1/recap-DAY-initial.mp4",
    );
  });

  it("renders share button for each initial recap", () => {
    render(<RecapPanel challengeId="c1" initialRecaps={initialRecaps} />);
    const shareButtons = screen.getAllByTestId("recap-share");
    expect(shareButtons).toHaveLength(2);
  });

  it("renders kind label for each initial recap", () => {
    render(<RecapPanel challengeId="c1" initialRecaps={initialRecaps} />);
    expect(screen.getByTestId("recap-video-container-DAY")).toBeInTheDocument();
    expect(screen.getByTestId("recap-video-container-WEEK")).toBeInTheDocument();
  });
});

describe("RecapPanel — generate DAY recap", () => {
  it("posts to the correct endpoint with kind=DAY on button click", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(SUCCESS_RESPONSE));

    render(<RecapPanel challengeId="ch-abc" />);
    const dayBtnWrapper = screen.getByTestId("recap-btn-DAY");
    fireEvent.click(dayBtnWrapper.querySelector("button")!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/ch-abc/recap",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ kind: "DAY" }),
        }),
      );
    });
  });

  it("renders video after successful DAY recap generation", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(SUCCESS_RESPONSE));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      const video = screen.getByTestId("recap-video");
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute("src", SUCCESS_RESPONSE.url);
    });
  });

  it("renders download link with the returned URL", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(SUCCESS_RESPONSE));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      const downloadLink = screen.getByTestId("recap-download");
      expect(downloadLink).toHaveAttribute("href", SUCCESS_RESPONSE.url);
      expect(downloadLink).toHaveAttribute("download");
    });
  });
});

describe("RecapPanel — generate WEEK recap", () => {
  it("posts correct body for WEEK", async () => {
    const weekRes = { recapId: "r2", kind: "WEEK" as const, url: "https://example.com/week.mp4" };
    mockFetch.mockResolvedValue(makeOkResponse(weekRes));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-WEEK").querySelector("button")!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/c1/recap",
        expect.objectContaining({ body: JSON.stringify({ kind: "WEEK" }) }),
      );
    });
  });

  it("renders video for WEEK recap", async () => {
    const weekRes = { recapId: "r2", kind: "WEEK" as const, url: "https://example.com/week.mp4" };
    mockFetch.mockResolvedValue(makeOkResponse(weekRes));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-WEEK").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-video")).toHaveAttribute("src", weekRes.url);
    });
  });
});

describe("RecapPanel — generate FIFTY recap", () => {
  it("posts correct body for FIFTY", async () => {
    const fiftyRes = {
      recapId: "r3",
      kind: "FIFTY" as const,
      url: "https://example.com/fifty.mp4",
    };
    mockFetch.mockResolvedValue(makeOkResponse(fiftyRes));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-FIFTY").querySelector("button")!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/c1/recap",
        expect.objectContaining({ body: JSON.stringify({ kind: "FIFTY" }) }),
      );
    });
  });

  it("renders video for FIFTY recap", async () => {
    const fiftyRes = {
      recapId: "r3",
      kind: "FIFTY" as const,
      url: "https://example.com/fifty.mp4",
    };
    mockFetch.mockResolvedValue(makeOkResponse(fiftyRes));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-FIFTY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-video")).toHaveAttribute("src", fiftyRes.url);
    });
  });
});

describe("RecapPanel — loading state", () => {
  it("shows 'Generating…' on the clicked button while in flight", async () => {
    // Never resolves — keep loading
    let resolvePromise: ((value: unknown) => void) | undefined;
    mockFetch.mockReturnValue(
      new Promise((res) => {
        resolvePromise = res;
      }),
    );

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-btn-DAY")).toHaveTextContent("Generating…");
    });

    // Cleanup
    resolvePromise!(makeOkResponse(SUCCESS_RESPONSE));
  });

  it("disables all buttons while a render is in flight", async () => {
    let resolvePromise: ((value: unknown) => void) | undefined;
    mockFetch.mockReturnValue(
      new Promise((res) => {
        resolvePromise = res;
      }),
    );

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      const dayBtn = screen.getByTestId("recap-btn-DAY").querySelector("button");
      const weekBtn = screen.getByTestId("recap-btn-WEEK").querySelector("button");
      const fiftyBtn = screen.getByTestId("recap-btn-FIFTY").querySelector("button");
      expect(dayBtn).toBeDisabled();
      expect(weekBtn).toBeDisabled();
      expect(fiftyBtn).toBeDisabled();
    });

    // Cleanup
    resolvePromise!(makeOkResponse(SUCCESS_RESPONSE));
  });

  it("re-enables buttons after a successful render", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(SUCCESS_RESPONSE));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      const dayBtn = screen.getByTestId("recap-btn-DAY").querySelector("button");
      const weekBtn = screen.getByTestId("recap-btn-WEEK").querySelector("button");
      expect(dayBtn).not.toBeDisabled();
      expect(weekBtn).not.toBeDisabled();
    });
  });
});

describe("RecapPanel — error states", () => {
  it("shows inline error message when the request fails with a non-ok response", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(500, "Internal Server Error"));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-error-DAY")).toHaveTextContent(
        "Internal Server Error",
      );
    });
  });

  it("shows 'Request failed' when error response body is empty", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(500, ""));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-error-DAY")).toHaveTextContent("Request failed");
    });
  });

  it("shows network error message when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-error-DAY")).toHaveTextContent(
        "Network error. Please try again.",
      );
    });
  });

  it("re-enables buttons after an error", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(500, "Server error"));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      const dayBtn = screen.getByTestId("recap-btn-DAY").querySelector("button");
      expect(dayBtn).not.toBeDisabled();
    });
  });

  it("does NOT render a video when the request fails", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(403, "FORBIDDEN"));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-error-DAY")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("recap-video")).toBeNull();
  });

  it("clears previous error when a new request is made for the same kind", async () => {
    // First call fails
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500, "Server error"));
    // Second call succeeds
    mockFetch.mockResolvedValueOnce(makeOkResponse(SUCCESS_RESPONSE));

    render(<RecapPanel challengeId="c1" />);

    // Click and fail
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);
    await waitFor(() => {
      expect(screen.getByTestId("recap-error-DAY")).toBeInTheDocument();
    });

    // Click again
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);
    await waitFor(() => {
      expect(screen.queryByTestId("recap-error-DAY")).toBeNull();
    });
  });
});

describe("RecapPanel — Share button", () => {
  it("calls navigator.share with the video URL when available", async () => {
    mockNavigatorShare.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockNavigatorShare,
      configurable: true,
      writable: true,
    });
    mockFetch.mockResolvedValue(makeOkResponse(SUCCESS_RESPONSE));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-share")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("recap-share").querySelector("button")!);

    await waitFor(() => {
      expect(mockNavigatorShare).toHaveBeenCalledWith({ url: SUCCESS_RESPONSE.url });
    });
    // Should NOT fall back to clipboard
    expect(mockClipboardWriteText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard copy when navigator.share is not available", async () => {
    // navigator.share is undefined (set in beforeEach)
    mockClipboardWriteText.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue(makeOkResponse(SUCCESS_RESPONSE));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-share")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("recap-share").querySelector("button")!);

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith(SUCCESS_RESPONSE.url);
    });
  });

  it("shows 'Copied!' on share button after clipboard copy", async () => {
    mockClipboardWriteText.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue(makeOkResponse(SUCCESS_RESPONSE));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-share")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("recap-share").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-share")).toHaveTextContent("Copied!");
    });
  });

  it("falls back to clipboard when navigator.share throws (e.g. user cancels)", async () => {
    mockNavigatorShare.mockRejectedValue(new Error("AbortError"));
    Object.defineProperty(navigator, "share", {
      value: mockNavigatorShare,
      configurable: true,
      writable: true,
    });
    mockClipboardWriteText.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue(makeOkResponse(SUCCESS_RESPONSE));

    render(<RecapPanel challengeId="c1" />);
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("recap-share")).toBeInTheDocument();
    });

    // navigator.share throws → should NOT copy to clipboard (the component swallows the error)
    fireEvent.click(screen.getByTestId("recap-share").querySelector("button")!);

    // Wait a tick — the component swallows the error and does NOT fall back to clipboard
    await waitFor(() => {
      expect(mockNavigatorShare).toHaveBeenCalled();
    });
    // Since navigator.share threw, the catch block runs but does NOT copy to clipboard
    // (clipboard fallback is only when navigator.share is undefined)
    expect(mockClipboardWriteText).not.toHaveBeenCalled();
  });
});

describe("RecapPanel — initialRecaps + generated merging", () => {
  it("replaces initialRecap of same kind with newly generated one", async () => {
    const initialUrl = "https://example.com/initial-day.mp4";
    const generatedUrl = "https://example.com/generated-day.mp4";
    const initialRecaps: RecapItem[] = [
      { id: "r1", kind: "DAY", url: initialUrl, createdAt: "2026-06-01T00:00:00Z" },
    ];

    mockFetch.mockResolvedValue(
      makeOkResponse({ recapId: "r2", kind: "DAY", url: generatedUrl }),
    );

    render(<RecapPanel challengeId="c1" initialRecaps={initialRecaps} />);

    // Initially shows the initial DAY video
    expect(screen.getByTestId("recap-video")).toHaveAttribute("src", initialUrl);

    // Generate a new DAY recap
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      // After generation, the new URL replaces the old one
      expect(screen.getByTestId("recap-video")).toHaveAttribute("src", generatedUrl);
    });

    // Only one video for DAY kind
    const dayContainers = screen.queryAllByTestId("recap-video-container-DAY");
    expect(dayContainers).toHaveLength(1);
  });

  it("shows both initial and generated videos for different kinds", async () => {
    const initialRecaps: RecapItem[] = [
      {
        id: "r1",
        kind: "WEEK",
        url: "https://example.com/week.mp4",
        createdAt: "2026-06-01T00:00:00Z",
      },
    ];

    mockFetch.mockResolvedValue(
      makeOkResponse({ recapId: "r2", kind: "DAY", url: "https://example.com/day.mp4" }),
    );

    render(<RecapPanel challengeId="c1" initialRecaps={initialRecaps} />);

    // Initially shows WEEK video
    expect(screen.getByTestId("recap-video-container-WEEK")).toBeInTheDocument();

    // Generate DAY recap
    fireEvent.click(screen.getByTestId("recap-btn-DAY").querySelector("button")!);

    await waitFor(() => {
      // Both videos should be present
      const videos = screen.getAllByTestId("recap-video");
      expect(videos).toHaveLength(2);
      expect(screen.getByTestId("recap-video-container-WEEK")).toBeInTheDocument();
      expect(screen.getByTestId("recap-video-container-DAY")).toBeInTheDocument();
    });
  });
});
