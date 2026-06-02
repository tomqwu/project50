import type { Publisher, Capability, PublishAsset, PublishResult } from "../types";

function isConfigured(): boolean {
  return !!(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN);
}

export const facebookPublisher: Publisher = {
  platform: "FACEBOOK",

  capability(): Capability {
    if (isConfigured()) {
      return {
        platform: "FACEBOOK",
        method: "API",
        apiAvailable: true,
      };
    }
    return {
      platform: "FACEBOOK",
      method: "DEEPLINK",
      apiAvailable: false,
      reason: "Facebook publishing not configured (needs page token + app review)",
    };
  },

  async publish(asset: PublishAsset): Promise<PublishResult> {
    if (!isConfigured()) {
      const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(asset.url)}`;
      return {
        ok: true,
        method: "DEEPLINK",
        shareUrl,
      };
    }

    const pageId = process.env.FB_PAGE_ID!;
    const token = process.env.FB_PAGE_TOKEN!;

    try {
      let endpoint: string;
      let body: Record<string, string>;

      if (asset.kind === "VIDEO") {
        endpoint = `https://graph.facebook.com/v21.0/${pageId}/videos`;
        body = {
          file_url: asset.url,
          access_token: token,
          ...(asset.caption ? { description: asset.caption } : {}),
        };
      } else {
        endpoint = `https://graph.facebook.com/v21.0/${pageId}/photos`;
        body = {
          url: asset.url,
          access_token: token,
          ...(asset.caption ? { caption: asset.caption } : {}),
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { id?: string; error?: { message: string } };

      if (!res.ok || data.error) {
        return {
          ok: false,
          method: "API",
          error: data.error?.message ?? `Facebook API error ${res.status}`,
        };
      }

      return {
        ok: true,
        method: "API",
        externalUrl: `https://www.facebook.com/${data.id}`,
      };
    } catch (err) {
      return {
        ok: false,
        method: "API",
        error: err instanceof Error ? err.message : "Unknown Facebook API error",
      };
    }
  },
};
