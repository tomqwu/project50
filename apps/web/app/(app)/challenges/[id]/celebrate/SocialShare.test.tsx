import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { Capability } from "@/lib/publish/types";

const {
  mockFetch,
  mockNavigatorShare,
  mockClipboardWriteText,
  mockWindowOpen,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockNavigatorShare: vi.fn(),
  mockClipboardWriteText: vi.fn(),
  mockWindowOpen: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("open", mockWindowOpen);

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockClipboardWriteText },
    configurable: true,
    writable: true,
  });
  // Default: navigator.share NOT available
  Object.defineProperty(navigator, "share", {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

import { SocialShare } from "./SocialShare";

// Canonical capabilities for the default (unconfigured) test environment:
// Facebook → DEEPLINK, Instagram → WEBSHARE, WeChat → WEBSHARE
const defaultCapabilities: Capability[] = [
  {
    platform: "FACEBOOK",
    method: "DEEPLINK",
    apiAvailable: false,
    reason: "Facebook publishing not configured (needs page token + app review)",
  },
  {
    platform: "INSTAGRAM",
    method: "WEBSHARE",
    apiAvailable: false,
    reason: "Instagram publishing requires a business account + app review",
  },
  {
    platform: "WECHAT",
    method: "WEBSHARE",
    apiAvailable: false,
    reason: "WeChat share requires the WeChat in-app browser / official account",
  },
];

const apiCapabilities: Capability[] = [
  { platform: "FACEBOOK", method: "API", apiAvailable: true },
  { platform: "INSTAGRAM", method: "API", apiAvailable: true },
  { platform: "WECHAT", method: "API", apiAvailable: true },
];

function makeProps(
  overrides: Partial<{
    challengeId: string;
    hasRecap: boolean;
    isPublic: boolean;
    capabilities: Capability[];
  }> = {},
) {
  return {
    challengeId: "c1",
    hasRecap: true,
    isPublic: true,
    capabilities: defaultCapabilities,
    ...overrides,
  };
}

function makePublishResult(overrides: Partial<{
  ok: boolean;
  method: "API" | "DEEPLINK" | "WEBSHARE";
  shareUrl: string;
  externalUrl: string;
  error: string;
}> = {}) {
  return {
    ok: true,
    method: "DEEPLINK" as const,
    shareUrl: "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.com%2Fcard",
    ...overrides,
  };
}

function mockPublishResponse(result: object, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => result,
  });
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("SocialShare — rendering", () => {
  it("renders the social share panel", () => {
    render(<SocialShare {...makeProps()} />);
    expect(screen.getByTestId("social-share-panel")).toBeInTheDocument();
  });

  it("renders Facebook, Instagram, WeChat platform buttons", () => {
    render(<SocialShare {...makeProps()} />);
    expect(screen.getByTestId("platform-FACEBOOK")).toBeInTheDocument();
    expect(screen.getByTestId("platform-INSTAGRAM")).toBeInTheDocument();
    expect(screen.getByTestId("platform-WECHAT")).toBeInTheDocument();
  });

  it("renders asset toggle with Image card and Recap video", () => {
    render(<SocialShare {...makeProps()} />);
    expect(screen.getByTestId("asset-image")).toBeInTheDocument();
    expect(screen.getByTestId("asset-video")).toBeInTheDocument();
  });

  it("defaults to Image card selected", () => {
    render(<SocialShare {...makeProps()} />);
    const imageBtn = screen.getByTestId("asset-image");
    expect(imageBtn).toHaveAttribute("aria-pressed", "true");
    const videoBtn = screen.getByTestId("asset-video");
    expect(videoBtn).toHaveAttribute("aria-pressed", "false");
  });
});

// ─── Honest labels ───────────────────────────────────────────────────────────

describe("SocialShare — honest labels", () => {
  it("shows platform name (not 'Post to X') when apiAvailable is false", () => {
    render(<SocialShare {...makeProps()} />);
    // Facebook button should say "Facebook" not "Post to Facebook"
    const fb = screen.getByTestId("platform-FACEBOOK");
    expect(fb.querySelector("button")).toHaveTextContent("Facebook");
  });

  it("shows subtitle with reason when apiAvailable is false", () => {
    render(<SocialShare {...makeProps()} />);
    const subtitle = screen.getByTestId("platform-subtitle-FACEBOOK");
    expect(subtitle).toHaveTextContent(
      "Facebook publishing not configured (needs page token + app review)",
    );
  });

  it("shows 'Post to Facebook' when apiAvailable is true", () => {
    render(<SocialShare {...makeProps({ capabilities: apiCapabilities })} />);
    const fb = screen.getByTestId("platform-FACEBOOK");
    expect(fb.querySelector("button")).toHaveTextContent("Post to Facebook");
  });

  it("shows 'Post to Instagram' when apiAvailable is true", () => {
    render(<SocialShare {...makeProps({ capabilities: apiCapabilities })} />);
    const ig = screen.getByTestId("platform-INSTAGRAM");
    expect(ig.querySelector("button")).toHaveTextContent("Post to Instagram");
  });

  it("shows 'Post to WeChat' when apiAvailable is true", () => {
    render(<SocialShare {...makeProps({ capabilities: apiCapabilities })} />);
    const wc = screen.getByTestId("platform-WECHAT");
    expect(wc.querySelector("button")).toHaveTextContent("Post to WeChat");
  });

  it("does NOT show subtitle when apiAvailable is true", () => {
    render(<SocialShare {...makeProps({ capabilities: apiCapabilities })} />);
    expect(screen.queryByTestId("platform-subtitle-FACEBOOK")).toBeNull();
  });

  it("shows 'Opens share' subtitle when reason is undefined and apiAvailable false", () => {
    const caps: Capability[] = [
      { platform: "FACEBOOK", method: "DEEPLINK", apiAvailable: false },
    ];
    render(<SocialShare {...makeProps({ capabilities: caps })} />);
    const subtitle = screen.getByTestId("platform-subtitle-FACEBOOK");
    expect(subtitle).toHaveTextContent("Opens share");
  });
});

// ─── Asset toggle disabled states ────────────────────────────────────────────

describe("SocialShare — asset toggle disabled states", () => {
  it("Recap video button is disabled when hasRecap is false", () => {
    render(<SocialShare {...makeProps({ hasRecap: false })} />);
    const videoBtn = screen.getByTestId("asset-video");
    expect(videoBtn).toBeDisabled();
  });

  it("Image card button is disabled when isPublic is false", () => {
    render(<SocialShare {...makeProps({ isPublic: false })} />);
    const imageBtn = screen.getByTestId("asset-image");
    expect(imageBtn).toBeDisabled();
  });

  it("Recap video button is enabled when hasRecap is true", () => {
    render(<SocialShare {...makeProps({ hasRecap: true })} />);
    const videoBtn = screen.getByTestId("asset-video");
    expect(videoBtn).not.toBeDisabled();
  });

  it("Image card button is enabled when isPublic is true", () => {
    render(<SocialShare {...makeProps({ isPublic: true })} />);
    const imageBtn = screen.getByTestId("asset-image");
    expect(imageBtn).not.toBeDisabled();
  });

  it("shows image-disabled hint when isPublic is false", () => {
    render(<SocialShare {...makeProps({ isPublic: false })} />);
    expect(screen.getByTestId("image-disabled-hint")).toHaveTextContent(
      "Make the challenge public to share the card",
    );
  });

  it("does NOT show image-disabled hint when isPublic is true", () => {
    render(<SocialShare {...makeProps({ isPublic: true })} />);
    expect(screen.queryByTestId("image-disabled-hint")).toBeNull();
  });

  it("clicking disabled video button does not change selection", () => {
    render(<SocialShare {...makeProps({ hasRecap: false })} />);
    const videoBtn = screen.getByTestId("asset-video");
    fireEvent.click(videoBtn);
    // IMAGE should still be selected
    expect(screen.getByTestId("asset-image")).toHaveAttribute("aria-pressed", "true");
    expect(videoBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking disabled image button does not change selection", () => {
    // Start with VIDEO selected (needs recap)
    render(<SocialShare {...makeProps({ hasRecap: true, isPublic: false })} />);
    // First select VIDEO (image is disabled so IMAGE is default but disabled)
    // We start on IMAGE which is disabled. Try clicking VIDEO to switch, then back
    const videoBtn = screen.getByTestId("asset-video");
    fireEvent.click(videoBtn);
    expect(videoBtn).toHaveAttribute("aria-pressed", "true");
    // Now try clicking IMAGE (disabled) — should stay on VIDEO
    const imageBtn = screen.getByTestId("asset-image");
    fireEvent.click(imageBtn);
    expect(videoBtn).toHaveAttribute("aria-pressed", "true");
    expect(imageBtn).toHaveAttribute("aria-pressed", "false");
  });
});

// ─── Asset toggle works ───────────────────────────────────────────────────────

describe("SocialShare — asset toggle switching", () => {
  it("clicking Recap video selects it when hasRecap is true", () => {
    render(<SocialShare {...makeProps({ hasRecap: true })} />);
    const videoBtn = screen.getByTestId("asset-video");
    fireEvent.click(videoBtn);
    expect(videoBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("asset-image")).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking Image card after switching back reselects it", () => {
    render(<SocialShare {...makeProps({ hasRecap: true })} />);
    fireEvent.click(screen.getByTestId("asset-video"));
    fireEvent.click(screen.getByTestId("asset-image"));
    expect(screen.getByTestId("asset-image")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("asset-video")).toHaveAttribute("aria-pressed", "false");
  });
});

// ─── Platform posts correct body ─────────────────────────────────────────────

describe("SocialShare — POST body", () => {
  it("posts correct body for Facebook with IMAGE asset", async () => {
    mockPublishResponse(makePublishResult());
    render(<SocialShare {...makeProps()} />);

    const fb = screen.getByTestId("platform-FACEBOOK");
    fireEvent.click(fb.querySelector("button")!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/c1/publish",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: "FACEBOOK", assetKind: "IMAGE" }),
        }),
      );
    });
  });

  it("posts correct body for Instagram with VIDEO asset", async () => {
    mockPublishResponse({
      ok: true,
      method: "WEBSHARE",
      shareUrl: "https://example.com/video.mp4",
    });
    render(<SocialShare {...makeProps({ hasRecap: true })} />);

    // Switch to VIDEO
    fireEvent.click(screen.getByTestId("asset-video"));

    const ig = screen.getByTestId("platform-INSTAGRAM");
    fireEvent.click(ig.querySelector("button")!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/c1/publish",
        expect.objectContaining({
          body: JSON.stringify({ platform: "INSTAGRAM", assetKind: "VIDEO" }),
        }),
      );
    });
  });

  it("posts correct body for WeChat", async () => {
    mockPublishResponse({ ok: true, method: "WEBSHARE", shareUrl: "https://example.com/card" });
    render(<SocialShare {...makeProps()} />);

    const wc = screen.getByTestId("platform-WECHAT");
    fireEvent.click(wc.querySelector("button")!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/c1/publish",
        expect.objectContaining({
          body: JSON.stringify({ platform: "WECHAT", assetKind: "IMAGE" }),
        }),
      );
    });
  });
});

// ─── DEEPLINK handling ───────────────────────────────────────────────────────

describe("SocialShare — DEEPLINK result", () => {
  it("calls window.open with the shareUrl for DEEPLINK method", async () => {
    const shareUrl =
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.com%2Fcard";
    mockPublishResponse({ ok: true, method: "DEEPLINK", shareUrl });
    render(<SocialShare {...makeProps()} />);

    const fb = screen.getByTestId("platform-FACEBOOK");
    fireEvent.click(fb.querySelector("button")!);

    await waitFor(() => {
      expect(mockWindowOpen).toHaveBeenCalledWith(shareUrl, "_blank", "noopener");
    });
  });

  it("shows 'Opening share…' status for DEEPLINK (NOT 'Posted!')", async () => {
    mockPublishResponse({
      ok: true,
      method: "DEEPLINK",
      shareUrl: "https://www.facebook.com/sharer/sharer.php?u=x",
    });
    render(<SocialShare {...makeProps()} />);

    const fb = screen.getByTestId("platform-FACEBOOK");
    fireEvent.click(fb.querySelector("button")!);

    await waitFor(() => {
      const success = screen.getByTestId("platform-success-FACEBOOK");
      expect(success).toHaveTextContent("Opening share…");
      expect(success).not.toHaveTextContent("Posted!");
    });
  });

  it("does NOT render 'View post' link for DEEPLINK result", async () => {
    mockPublishResponse({
      ok: true,
      method: "DEEPLINK",
      shareUrl: "https://www.facebook.com/sharer/sharer.php?u=x",
    });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      expect(screen.queryByTestId("platform-external-link-FACEBOOK")).toBeNull();
    });
  });
});

// ─── WEBSHARE handling ───────────────────────────────────────────────────────

describe("SocialShare — WEBSHARE result with navigator.share", () => {
  it("calls navigator.share with shareUrl when available", async () => {
    mockNavigatorShare.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockNavigatorShare,
      configurable: true,
      writable: true,
    });

    mockPublishResponse({
      ok: true,
      method: "WEBSHARE",
      shareUrl: "https://example.com/card",
    });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-INSTAGRAM").querySelector("button")!);

    await waitFor(() => {
      expect(mockNavigatorShare).toHaveBeenCalledWith({
        url: "https://example.com/card",
      });
    });
    expect(mockClipboardWriteText).not.toHaveBeenCalled();
  });

  it("shows 'Shared via your device' status for WEBSHARE (NOT 'Posted!')", async () => {
    mockNavigatorShare.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockNavigatorShare,
      configurable: true,
      writable: true,
    });

    mockPublishResponse({ ok: true, method: "WEBSHARE", shareUrl: "https://example.com/x" });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-INSTAGRAM").querySelector("button")!);

    await waitFor(() => {
      const success = screen.getByTestId("platform-success-INSTAGRAM");
      expect(success).toHaveTextContent("Shared via your device");
      expect(success).not.toHaveTextContent("Posted!");
    });
  });
});

describe("SocialShare — WEBSHARE clipboard fallback (no navigator.share)", () => {
  it("copies shareUrl to clipboard when navigator.share is not available", async () => {
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    mockClipboardWriteText.mockResolvedValue(undefined);

    mockPublishResponse({
      ok: true,
      method: "WEBSHARE",
      shareUrl: "https://example.com/card",
    });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-INSTAGRAM").querySelector("button")!);

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith("https://example.com/card");
    });
  });

  it("shows 'Shared via your device' after clipboard fallback", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true, writable: true });
    mockClipboardWriteText.mockResolvedValue(undefined);
    mockPublishResponse({ ok: true, method: "WEBSHARE", shareUrl: "https://example.com/card" });

    render(<SocialShare {...makeProps()} />);
    fireEvent.click(screen.getByTestId("platform-INSTAGRAM").querySelector("button")!);

    await waitFor(() => {
      const success = screen.getByTestId("platform-success-INSTAGRAM");
      expect(success).toHaveTextContent("Shared via your device");
    });
  });
});

// ─── API method ───────────────────────────────────────────────────────────────

describe("SocialShare — API result", () => {
  it("shows 'Posted!' and View post link when method is API and result.ok", async () => {
    mockPublishResponse({
      ok: true,
      method: "API",
      externalUrl: "https://www.facebook.com/posts/123",
    });
    render(<SocialShare {...makeProps({ capabilities: apiCapabilities })} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      const success = screen.getByTestId("platform-success-FACEBOOK");
      expect(success).toHaveTextContent("Posted!");
      const link = screen.getByTestId("platform-external-link-FACEBOOK");
      expect(link).toHaveAttribute("href", "https://www.facebook.com/posts/123");
      expect(link).toHaveTextContent("View post");
    });
  });

  it("shows 'Posted!' without View post link when API result has no externalUrl", async () => {
    mockPublishResponse({ ok: true, method: "API" });
    render(<SocialShare {...makeProps({ capabilities: apiCapabilities })} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      const success = screen.getByTestId("platform-success-FACEBOOK");
      expect(success).toHaveTextContent("Posted!");
      expect(screen.queryByTestId("platform-external-link-FACEBOOK")).toBeNull();
    });
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("SocialShare — error handling", () => {
  it("shows inline error when result.ok is false", async () => {
    mockPublishResponse({ ok: false, method: "DEEPLINK", error: "Rate limit exceeded" });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      const err = screen.getByTestId("platform-error-FACEBOOK");
      expect(err).toHaveTextContent("Rate limit exceeded");
    });
  });

  it("shows inline error when fetch returns non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ ok: false, error: "MUST_BE_PUBLIC" }),
    });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      const err = screen.getByTestId("platform-error-FACEBOOK");
      expect(err).toHaveTextContent("MUST_BE_PUBLIC");
    });
  });

  it("shows fallback error message when error field is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ ok: false }),
    });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      const err = screen.getByTestId("platform-error-FACEBOOK");
      expect(err).toHaveTextContent("Error 500");
    });
  });

  it("shows error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network down"));
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      const err = screen.getByTestId("platform-error-FACEBOOK");
      expect(err).toHaveTextContent("Network down");
    });
  });

  it("does NOT show 'Posted!' on error", async () => {
    mockPublishResponse({ ok: false, method: "DEEPLINK", error: "fail" });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("platform-error-FACEBOOK")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("platform-success-FACEBOOK")).toBeNull();
  });
});

// ─── Loading / in-flight disabled state ──────────────────────────────────────

describe("SocialShare — loading state", () => {
  it("shows 'Sharing…' label while in-flight and button is disabled", async () => {
    let resolvePublish!: (v: unknown) => void;
    const pendingPublish = new Promise((res) => { resolvePublish = res; });
    mockFetch.mockReturnValueOnce(pendingPublish);

    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      const fb = screen.getByTestId("platform-FACEBOOK");
      const btn = fb.querySelector("button")!;
      expect(btn).toHaveTextContent("Sharing…");
      expect(btn).toBeDisabled();
    });

    // Resolve to avoid hanging
    resolvePublish({ ok: true, status: 200, json: async () => ({ ok: true, method: "DEEPLINK", shareUrl: "https://fb.com" }) });
  });

  it("does not trigger duplicate click while loading", async () => {
    let resolvePublish!: (v: unknown) => void;
    const pendingPublish = new Promise((res) => { resolvePublish = res; });
    mockFetch.mockReturnValueOnce(pendingPublish);

    render(<SocialShare {...makeProps()} />);
    const fbBtn = screen.getByTestId("platform-FACEBOOK").querySelector("button")!;

    fireEvent.click(fbBtn);
    await waitFor(() => expect(fbBtn).toBeDisabled());
    fireEvent.click(fbBtn);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    resolvePublish({ ok: true, status: 200, json: async () => ({ ok: true, method: "DEEPLINK", shareUrl: "https://fb.com" }) });
  });

  it("platform button is disabled when IMAGE selected and challenge is not public", () => {
    render(<SocialShare {...makeProps({ isPublic: false })} />);
    // IMAGE is selected (default) and not public → platform buttons should be disabled
    const fbBtn = screen.getByTestId("platform-FACEBOOK").querySelector("button")!;
    expect(fbBtn).toBeDisabled();
  });
});

// ─── HONESTY: never show "Posted!" for non-API ───────────────────────────────

describe("SocialShare — honesty: no fake Posted! for non-API", () => {
  it("never shows 'Posted!' for DEEPLINK result", async () => {
    mockPublishResponse({ ok: true, method: "DEEPLINK", shareUrl: "https://fb.com/sharer" });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("platform-success-FACEBOOK")).toBeInTheDocument();
    });
    expect(screen.getByTestId("platform-success-FACEBOOK")).not.toHaveTextContent("Posted!");
  });

  it("never shows 'Posted!' for WEBSHARE result", async () => {
    mockNavigatorShare.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: mockNavigatorShare, configurable: true, writable: true });
    mockPublishResponse({ ok: true, method: "WEBSHARE", shareUrl: "https://example.com/x" });
    render(<SocialShare {...makeProps()} />);

    fireEvent.click(screen.getByTestId("platform-FACEBOOK").querySelector("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("platform-success-FACEBOOK")).toBeInTheDocument();
    });
    expect(screen.getByTestId("platform-success-FACEBOOK")).not.toHaveTextContent("Posted!");
  });
});
