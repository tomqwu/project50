import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { instagramPublisher } from "./instagram";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.IG_USER_ID;
  delete process.env.IG_TOKEN;
});

describe("instagramPublisher — unconfigured (no env)", () => {
  it("capability() returns WEBSHARE + apiAvailable:false + reason", () => {
    const cap = instagramPublisher.capability();
    expect(cap.platform).toBe("INSTAGRAM");
    expect(cap.method).toBe("WEBSHARE");
    expect(cap.apiAvailable).toBe(false);
    expect(cap.reason).toContain("business account");
  });

  it("publish() returns WEBSHARE with shareUrl = asset.url", async () => {
    const url = "https://example.com/card.png";
    const result = await instagramPublisher.publish({ kind: "IMAGE", url });
    expect(result.ok).toBe(true);
    expect(result.method).toBe("WEBSHARE");
    expect(result.shareUrl).toBe(url);
  });

  it("publish() returns WEBSHARE for VIDEO too", async () => {
    const url = "https://example.com/recap.mp4";
    const result = await instagramPublisher.publish({ kind: "VIDEO", url });
    expect(result.ok).toBe(true);
    expect(result.method).toBe("WEBSHARE");
    expect(result.shareUrl).toBe(url);
  });
});

describe("instagramPublisher — configured (env set)", () => {
  beforeEach(() => {
    process.env.IG_USER_ID = "ig_user_456";
    process.env.IG_TOKEN = "IG_tok_xyz";
  });

  it("capability() returns API + apiAvailable:true", () => {
    const cap = instagramPublisher.capability();
    expect(cap.platform).toBe("INSTAGRAM");
    expect(cap.method).toBe("API");
    expect(cap.apiAvailable).toBe(true);
  });

  it("publish() IMAGE: creates container then publishes, returns externalUrl", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "container_1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "media_99" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await instagramPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
      caption: "Day 10!",
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("API");
    expect(result.externalUrl).toBe("https://www.instagram.com/p/media_99");

    // First call: create container
    const [url1, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url1).toBe("https://graph.facebook.com/v21.0/ig_user_456/media");
    const body1 = JSON.parse(init1.body as string);
    expect(body1.image_url).toBe("https://example.com/card.png");
    expect(body1.access_token).toBe("IG_tok_xyz");
    expect(body1.caption).toBe("Day 10!");

    // Second call: publish container
    const [url2, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url2).toBe("https://graph.facebook.com/v21.0/ig_user_456/media_publish");
    const body2 = JSON.parse(init2.body as string);
    expect(body2.creation_id).toBe("container_1");
    expect(body2.access_token).toBe("IG_tok_xyz");
  });

  it("publish() VIDEO: uses media_type=REELS + video_url", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "container_v" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "media_v" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await instagramPublisher.publish({
      kind: "VIDEO",
      url: "https://example.com/recap.mp4",
    });

    const [, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body1 = JSON.parse(init1.body as string);
    expect(body1.media_type).toBe("REELS");
    expect(body1.video_url).toBe("https://example.com/recap.mp4");
  });

  it("publish() returns ok:false when container creation fails with message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Invalid token" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await instagramPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.method).toBe("API");
    expect(result.error).toBe("Invalid token");
  });

  it("publish() returns ok:false when container creation fails with fallback error string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await instagramPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("503");
  });

  it("publish() returns ok:false when publish step fails with message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "container_1" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Publish failed" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await instagramPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Publish failed");
  });

  it("publish() returns ok:false when publish step fails with fallback error string", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "container_1" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({}),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await instagramPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("502");
  });

  it("publish() returns ok:false on network error (Error instance)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await instagramPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network failed");
  });

  it("publish() returns ok:false on non-Error throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue("string error");
    vi.stubGlobal("fetch", fetchMock);

    const result = await instagramPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown Instagram API error");
  });
});
