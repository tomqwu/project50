import { requireUser } from "@/lib/session";
import { handleRoute, unprocessable } from "@/lib/api/http";
import { publishChallengeAsset } from "@/lib/api/publish";
import type { Platform, AssetKind } from "@/lib/publish/types";

const VALID_PLATFORMS = new Set<string>(["FACEBOOK", "INSTAGRAM", "WECHAT", "WEBSHARE"]);
const VALID_ASSET_KINDS = new Set<string>(["IMAGE", "VIDEO"]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json();

    const platform: string = body?.platform;
    const assetKind: string = body?.assetKind;

    if (!platform || !VALID_PLATFORMS.has(platform)) {
      unprocessable("INVALID_PLATFORM");
    }

    if (!assetKind || !VALID_ASSET_KINDS.has(assetKind)) {
      unprocessable("INVALID_ASSET");
    }

    const result = await publishChallengeAsset(
      uid,
      id,
      platform as Platform,
      assetKind as AssetKind,
    );

    return Response.json(result);
  });
}
