import type { Publisher, Platform, Capability } from "./types";
import { websharePublisher } from "./adapters/webshare";
import { facebookPublisher } from "./adapters/facebook";
import { instagramPublisher } from "./adapters/instagram";
import { wechatPublisher } from "./adapters/wechat";

const publishers: Record<Platform, Publisher> = {
  WEBSHARE: websharePublisher,
  FACEBOOK: facebookPublisher,
  INSTAGRAM: instagramPublisher,
  WECHAT: wechatPublisher,
};

export function getPublisher(platform: Platform): Publisher {
  return publishers[platform];
}

export function getCapabilities(): Capability[] {
  return (Object.values(publishers) as Publisher[]).map((p) => p.capability());
}
