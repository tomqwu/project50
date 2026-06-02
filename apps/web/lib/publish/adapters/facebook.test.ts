import { describe, it, expect, vi, afterEach } from "vitest";
import { facebookPublisher } from "./facebook";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FB_PAGE_ID;
  delete process.env.FB_PAGE_TOKEN;
});

describe("facebookPublisher — unconfigured (no env)", () => {
  it("capability() returns DEEPLINK + apiAvailable:false + reason", () => {
    const cap = facebookPublisher.capability();
    expect(cap.platform).toBe("FACEBOOK");
    expect(cap.method).toBe("DEEPLINK");
    expect(cap.apiAvailable).toBe(false);
    expect(cap.reason).toContain("not configured");
  });

  it("publish() returns deeplink URL encoding the asset URL", async () => {
    const url = "https://example.com/card.png";
    const result = await facebookPublisher.publish({ kind: "IMAGE", url });
    expect(result.ok).toBe(true);
    expect(result.method).toBe("DEEPLINK");
    expect(result.shareUrl).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    );
  });

  it("publish() returns deeplink for VIDEO assets too", async () => {
    const url = "https://example.com/recap.mp4";
    const result = await facebookPublisher.publish({ kind: "VIDEO", url });
    expect(result.ok).toBe(true);
    expect(result.method).toBe("DEEPLINK");
    expect(result.shareUrl).toContain("facebook.com/sharer");
  });
});

describe("facebookPublisher — configured (env set)", () => {
  beforeEach(() => {
    process.env.FB_PAGE_ID = "page123";
    process.env.FB_PAGE_TOKEN = "tok_abc";
  });

  it("capability() returns API + apiAvailable:true", () => {
    const cap = facebookPublisher.capability();
    expect(cap.platform).toBe("FACEBOOK");
    expect(cap.method).toBe("API");
    expect(cap.apiAvailable).toBe(true);
  });

  it("publish() IMAGE calls /{page}/photos with url + access_token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "photo_1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await facebookPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
      caption: "Great shot",
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("API");
    expect(result.externalUrl).toBe("https://www.facebook.com/photo_1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/page123/photos");
    const body = JSON.parse(init.body as string);
    expect(body.url).toBe("https://example.com/card.png");
    expect(body.access_token).toBe("tok_abc");
    expect(body.caption).toBe("Great shot");
  });

  it("publish() VIDEO calls /{page}/videos with file_url + access_token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "video_2" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await facebookPublisher.publish({
      kind: "VIDEO",
      url: "https://example.com/recap.mp4",
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("API");
    expect(result.externalUrl).toBe("https://www.facebook.com/video_2");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/page123/videos");
    const body = JSON.parse(init.body as string);
    expect(body.file_url).toBe("https://example.com/recap.mp4");
    expect(body.access_token).toBe("tok_abc");
  });

  it("publish() VIDEO with caption sends description field", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "video_3" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await facebookPublisher.publish({
      kind: "VIDEO",
      url: "https://example.com/recap.mp4",
      caption: "My recap",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.description).toBe("My recap");
  });

  it("publish() returns ok:false on API error response with message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "OAuthException" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await facebookPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.method).toBe("API");
    expect(result.error).toBe("OAuthException");
  });

  it("publish() returns ok:false with fallback error string when no error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await facebookPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("503");
  });

  it("publish() VIDEO: returns ok:false with fallback error string when no error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await facebookPublisher.publish({
      kind: "VIDEO",
      url: "https://example.com/recap.mp4",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("publish() returns ok:false on network error (Error instance)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await facebookPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.method).toBe("API");
    expect(result.error).toContain("Network failed");
  });

  it("publish() returns ok:false on non-Error throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue("string error");
    vi.stubGlobal("fetch", fetchMock);

    const result = await facebookPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown Facebook API error");
  });
});

// Need to import beforeEach
import { beforeEach } from "vitest";
