import type { Publisher, Capability, PublishAsset, PublishResult } from "../types";

export const websharePublisher: Publisher = {
  platform: "WEBSHARE",

  capability(): Capability {
    return {
      platform: "WEBSHARE",
      method: "WEBSHARE",
      apiAvailable: false,
    };
  },

  async publish(asset: PublishAsset): Promise<PublishResult> {
    return {
      ok: true,
      method: "WEBSHARE",
      shareUrl: asset.url,
    };
  },
};
