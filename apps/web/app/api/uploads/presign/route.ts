import { requireUser } from "@/lib/session";
import { handleRoute, unprocessable } from "@/lib/api/http";
import { presignPut, newMediaKey, ensureBucket } from "@/lib/storage";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXT_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const SAFE_SUFFIX_RE = /^[a-zA-Z0-9_-]+$/;
const FALLBACK_SUFFIX = "upload";

export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();

    const body = await req.json() as { contentType?: unknown; ext?: unknown; suffix?: unknown };
    const { contentType, suffix: rawSuffix } = body;

    if (typeof contentType !== "string" || !ALLOWED_TYPES.has(contentType)) {
      unprocessable("INVALID_CONTENT_TYPE");
    }

    // Derive extension from the allowed content type (safe, no user input for ext)
    const safeExt = EXT_MAP[contentType as string]!;

    // Sanitize suffix: keep only [a-zA-Z0-9_-], fallback to fixed token
    const suffixStr = typeof rawSuffix === "string" ? rawSuffix : "";
    const safeSuffix = SAFE_SUFFIX_RE.test(suffixStr) ? suffixStr : FALLBACK_SUFFIX;

    await ensureBucket();

    const objectKey = newMediaKey(uid, safeExt, safeSuffix);
    const uploadUrl = await presignPut(objectKey, contentType as string);

    return Response.json({ uploadUrl, objectKey }, { status: 200 });
  });
}
