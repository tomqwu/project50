import type { Publisher, Capability, PublishAsset, PublishResult } from "../types";

function isConfigured(): boolean {
  return !!process.env.WECHAT_APP_ID;
}

export const wechatPublisher: Publisher = {
  platform: "WECHAT",

  capability(): Capability {
    if (isConfigured()) {
      return {
        platform: "WECHAT",
        method: "API",
        apiAvailable: true,
      };
    }
    return {
      platform: "WECHAT",
      method: "WEBSHARE",
      apiAvailable: false,
      reason: "WeChat share requires the WeChat in-app browser / official account",
    };
  },

  async publish(asset: PublishAsset): Promise<PublishResult> {
    if (!isConfigured()) {
      return {
        ok: true,
        method: "WEBSHARE",
        shareUrl: asset.url,
      };
    }

    // When WECHAT_APP_ID is configured, return the JS-SDK share config so the
    // client can call wx.updateAppMessageShareData / wx.updateTimelineShareData.
    // The actual API signing (jsapi_ticket + nonce + timestamp) happens in the client.
    const config = {
      appId: process.env.WECHAT_APP_ID!,
      title: asset.caption ?? "Check out my progress!",
      link: asset.url,
      imgUrl: asset.kind === "IMAGE" ? asset.url : undefined,
    };

    return {
      ok: true,
      method: "API",
      // Encode config as JSON in externalUrl so the client can parse and call wx.share
      externalUrl: `wechat-config:${JSON.stringify(config)}`,
    };
  },
};
