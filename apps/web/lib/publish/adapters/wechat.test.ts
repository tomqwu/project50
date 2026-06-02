import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { wechatPublisher } from "./wechat";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WECHAT_APP_ID;
});

describe("wechatPublisher — unconfigured (no env)", () => {
  it("capability() returns WEBSHARE + apiAvailable:false + reason", () => {
    const cap = wechatPublisher.capability();
    expect(cap.platform).toBe("WECHAT");
    expect(cap.method).toBe("WEBSHARE");
    expect(cap.apiAvailable).toBe(false);
    expect(cap.reason).toContain("WeChat");
  });

  it("publish() returns WEBSHARE with shareUrl = asset.url", async () => {
    const url = "https://example.com/card.png";
    const result = await wechatPublisher.publish({ kind: "IMAGE", url });
    expect(result.ok).toBe(true);
    expect(result.method).toBe("WEBSHARE");
    expect(result.shareUrl).toBe(url);
  });

  it("publish() returns WEBSHARE for VIDEO too", async () => {
    const url = "https://example.com/recap.mp4";
    const result = await wechatPublisher.publish({ kind: "VIDEO", url });
    expect(result.ok).toBe(true);
    expect(result.method).toBe("WEBSHARE");
    expect(result.shareUrl).toBe(url);
  });
});

describe("wechatPublisher — configured (env set)", () => {
  beforeEach(() => {
    process.env.WECHAT_APP_ID = "wx_app_123";
  });

  it("capability() returns API + apiAvailable:true", () => {
    const cap = wechatPublisher.capability();
    expect(cap.platform).toBe("WECHAT");
    expect(cap.method).toBe("API");
    expect(cap.apiAvailable).toBe(true);
  });

  it("publish() returns JS-SDK config with method:API and externalUrl containing appId", async () => {
    const result = await wechatPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
      caption: "My milestone",
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("API");
    expect(result.externalUrl).toBeDefined();
    expect(result.externalUrl).toContain("wechat-config:");

    const configJson = result.externalUrl!.replace("wechat-config:", "");
    const config = JSON.parse(configJson);
    expect(config.appId).toBe("wx_app_123");
    expect(config.link).toBe("https://example.com/card.png");
    expect(config.title).toBe("My milestone");
    expect(config.imgUrl).toBe("https://example.com/card.png");
  });

  it("publish() VIDEO: imgUrl is undefined", async () => {
    const result = await wechatPublisher.publish({
      kind: "VIDEO",
      url: "https://example.com/recap.mp4",
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("API");
    const configJson = result.externalUrl!.replace("wechat-config:", "");
    const config = JSON.parse(configJson);
    expect(config.imgUrl).toBeUndefined();
    expect(config.link).toBe("https://example.com/recap.mp4");
  });

  it("publish() uses default caption when no caption provided", async () => {
    const result = await wechatPublisher.publish({
      kind: "IMAGE",
      url: "https://example.com/card.png",
    });

    const configJson = result.externalUrl!.replace("wechat-config:", "");
    const config = JSON.parse(configJson);
    expect(config.title).toBeTruthy();
  });
});
