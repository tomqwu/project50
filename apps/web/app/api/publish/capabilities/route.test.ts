// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET } from "./route";

afterEach(() => {
  delete process.env.FB_PAGE_ID;
  delete process.env.FB_PAGE_TOKEN;
  delete process.env.IG_USER_ID;
  delete process.env.IG_TOKEN;
  delete process.env.WECHAT_APP_ID;
  delete process.env.FLAG_SHARE_INSTAGRAM;
});

describe("GET /api/publish/capabilities", () => {
  it("returns 200 with an array of capabilities (4 platforms)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(4);
  });

  it("each capability has platform, method, apiAvailable fields", async () => {
    const res = await GET();
    const body = await res.json();
    for (const cap of body) {
      expect(cap.platform).toBeDefined();
      expect(cap.method).toBeDefined();
      expect(typeof cap.apiAvailable).toBe("boolean");
    }
  });

  it("includes all four platforms", async () => {
    const res = await GET();
    const body = await res.json();
    const platforms = body.map((c: { platform: string }) => c.platform);
    expect(platforms).toContain("FACEBOOK");
    expect(platforms).toContain("INSTAGRAM");
    expect(platforms).toContain("WECHAT");
    expect(platforms).toContain("WEBSHARE");
  });

  it("reflects env — Facebook shows DEEPLINK when unconfigured", async () => {
    delete process.env.FB_PAGE_ID;
    const res = await GET();
    const body = await res.json();
    const fb = body.find((c: { platform: string }) => c.platform === "FACEBOOK");
    expect(fb.method).toBe("DEEPLINK");
    expect(fb.apiAvailable).toBe(false);
  });

  it("reflects env — Facebook shows API when configured", async () => {
    process.env.FB_PAGE_ID = "pg1";
    process.env.FB_PAGE_TOKEN = "tok1";
    const res = await GET();
    const body = await res.json();
    const fb = body.find((c: { platform: string }) => c.platform === "FACEBOOK");
    expect(fb.method).toBe("API");
    expect(fb.apiAvailable).toBe(true);
  });

  describe("shareInstagram kill-switch (#285)", () => {
    it("advertises INSTAGRAM when the flag is ON (default)", async () => {
      const res = await GET();
      const body = await res.json();
      const platforms = body.map((c: { platform: string }) => c.platform);
      expect(platforms).toContain("INSTAGRAM");
      expect(body).toHaveLength(4);
    });

    it("does NOT advertise INSTAGRAM when FLAG_SHARE_INSTAGRAM=false", async () => {
      process.env.FLAG_SHARE_INSTAGRAM = "false";
      const res = await GET();
      const body = await res.json();
      const platforms = body.map((c: { platform: string }) => c.platform);
      expect(platforms).not.toContain("INSTAGRAM");
      // Other platforms remain advertised — only Instagram is pulled.
      expect(platforms).toEqual(
        expect.arrayContaining(["FACEBOOK", "WECHAT", "WEBSHARE"]),
      );
      expect(body).toHaveLength(3);
    });
  });
});
