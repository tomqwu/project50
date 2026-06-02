export type Platform = "FACEBOOK" | "INSTAGRAM" | "WECHAT" | "WEBSHARE";

export type AssetKind = "IMAGE" | "VIDEO";

export interface PublishAsset {
  kind: AssetKind;
  url: string;
  caption?: string;
}

export type PublishMethod = "API" | "DEEPLINK" | "WEBSHARE";

export interface Capability {
  platform: Platform;
  method: PublishMethod;
  apiAvailable: boolean;
  reason?: string;
}

export interface PublishResult {
  ok: boolean;
  method: PublishMethod;
  externalUrl?: string;
  shareUrl?: string;
  error?: string;
}

export interface Publisher {
  platform: Platform;
  capability(): Capability;
  publish(asset: PublishAsset): Promise<PublishResult>;
}
