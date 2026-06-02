import { describe, it, expect, afterEach } from "vitest";
import { getPublisher, getCapabilities } from "./registry";

afterEach(() => {
  delete process.env.FB_PAGE_ID;
  delete process.env.FB_PAGE_TOKEN;
  delete process.env.IG_USER_ID;
  delete process.env.IG_TOKEN;
  delete process.env.WECHAT_APP_ID;
});

describe("getPublisher", () => {
  it("returns the WEBSHARE publisher", () => {
    const p = getPublisher("WEBSHARE");
    expect(p.platform).toBe("WEBSHARE");
  });

  it("returns the FACEBOOK publisher", () => {
    const p = getPublisher("FACEBOOK");
    expect(p.platform).toBe("FACEBOOK");
  });

  it("returns the INSTAGRAM publisher", () => {
    const p = getPublisher("INSTAGRAM");
    expect(p.platform).toBe("INSTAGRAM");
  });

  it("returns the WECHAT publisher", () => {
    const p = getPublisher("WECHAT");
    expect(p.platform).toBe("WECHAT");
  });
});

describe("getCapabilities", () => {
  it("returns one capability per platform (4 total)", () => {
    const caps = getCapabilities();
    expect(caps).toHaveLength(4);
  });

  it("includes all four platforms", () => {
    const caps = getCapabilities();
    const platforms = caps.map((c) => c.platform);
    expect(platforms).toContain("WEBSHARE");
    expect(platforms).toContain("FACEBOOK");
    expect(platforms).toContain("INSTAGRAM");
    expect(platforms).toContain("WECHAT");
  });

  it("reflects env — Facebook shows DEEPLINK when unconfigured", () => {
    delete process.env.FB_PAGE_ID;
    delete process.env.FB_PAGE_TOKEN;
    const caps = getCapabilities();
    const fb = caps.find((c) => c.platform === "FACEBOOK")!;
    expect(fb.method).toBe("DEEPLINK");
    expect(fb.apiAvailable).toBe(false);
  });

  it("reflects env — Facebook shows API when configured", () => {
    process.env.FB_PAGE_ID = "pg1";
    process.env.FB_PAGE_TOKEN = "tok1";
    const caps = getCapabilities();
    const fb = caps.find((c) => c.platform === "FACEBOOK")!;
    expect(fb.method).toBe("API");
    expect(fb.apiAvailable).toBe(true);
  });

  it("reflects env — Instagram shows WEBSHARE when unconfigured", () => {
    delete process.env.IG_USER_ID;
    delete process.env.IG_TOKEN;
    const caps = getCapabilities();
    const ig = caps.find((c) => c.platform === "INSTAGRAM")!;
    expect(ig.method).toBe("WEBSHARE");
    expect(ig.apiAvailable).toBe(false);
  });

  it("reflects env — Instagram shows API when configured", () => {
    process.env.IG_USER_ID = "u1";
    process.env.IG_TOKEN = "tok2";
    const caps = getCapabilities();
    const ig = caps.find((c) => c.platform === "INSTAGRAM")!;
    expect(ig.method).toBe("API");
    expect(ig.apiAvailable).toBe(true);
  });

  it("reflects env — WeChat shows WEBSHARE when unconfigured", () => {
    delete process.env.WECHAT_APP_ID;
    const caps = getCapabilities();
    const wx = caps.find((c) => c.platform === "WECHAT")!;
    expect(wx.method).toBe("WEBSHARE");
    expect(wx.apiAvailable).toBe(false);
  });

  it("reflects env — WeChat shows API when configured", () => {
    process.env.WECHAT_APP_ID = "wx1";
    const caps = getCapabilities();
    const wx = caps.find((c) => c.platform === "WECHAT")!;
    expect(wx.method).toBe("API");
    expect(wx.apiAvailable).toBe(true);
  });

  it("WEBSHARE always shows WEBSHARE regardless of env", () => {
    const caps = getCapabilities();
    const ws = caps.find((c) => c.platform === "WEBSHARE")!;
    expect(ws.method).toBe("WEBSHARE");
    expect(ws.apiAvailable).toBe(false);
  });
});
