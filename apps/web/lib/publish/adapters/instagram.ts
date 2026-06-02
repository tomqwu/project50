import type { Publisher, Capability, PublishAsset, PublishResult } from "../types";

function isConfigured(): boolean {
  return !!(process.env.IG_USER_ID && process.env.IG_TOKEN);
}

export const instagramPublisher: Publisher = {
  platform: "INSTAGRAM",

  capability(): Capability {
    if (isConfigured()) {
      return {
        platform: "INSTAGRAM",
        method: "API",
        apiAvailable: true,
      };
    }
    return {
      platform: "INSTAGRAM",
      method: "WEBSHARE",
      apiAvailable: false,
      reason: "Instagram publishing requires a business account + app review",
    };
  },

  async publish(asset: PublishAsset): Promise<PublishResult> {
    if (!isConfigured()) {
      // Instagram has no public web sharer for arbitrary URLs; WEBSHARE is the practical fallback
      return {
        ok: true,
        method: "WEBSHARE",
        shareUrl: asset.url,
      };
    }

    const userId = process.env.IG_USER_ID!;
    const token = process.env.IG_TOKEN!;

    try {
      // Step 1: Create media container
      const containerBody: Record<string, string> = {
        access_token: token,
      };

      if (asset.kind === "VIDEO") {
        containerBody.media_type = "REELS";
        containerBody.video_url = asset.url;
      } else {
        containerBody.image_url = asset.url;
      }

      if (asset.caption) {
        containerBody.caption = asset.caption;
      }

      const containerRes = await fetch(
        `https://graph.facebook.com/v21.0/${userId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(containerBody),
        },
      );

      const containerData = (await containerRes.json()) as {
        id?: string;
        error?: { message: string };
      };

      if (!containerRes.ok || containerData.error) {
        return {
          ok: false,
          method: "API",
          error:
            containerData.error?.message ??
            `Instagram container error ${containerRes.status}`,
        };
      }

      const creationId = containerData.id!;

      // Step 2: Publish the container
      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${userId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: creationId,
            access_token: token,
          }),
        },
      );

      const publishData = (await publishRes.json()) as {
        id?: string;
        error?: { message: string };
      };

      if (!publishRes.ok || publishData.error) {
        return {
          ok: false,
          method: "API",
          error:
            publishData.error?.message ??
            `Instagram publish error ${publishRes.status}`,
        };
      }

      return {
        ok: true,
        method: "API",
        externalUrl: `https://www.instagram.com/p/${publishData.id}`,
      };
    } catch (err) {
      return {
        ok: false,
        method: "API",
        error: err instanceof Error ? err.message : "Unknown Instagram API error",
      };
    }
  },
};
