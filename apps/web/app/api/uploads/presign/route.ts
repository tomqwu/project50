import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { presignPut, newMediaKey, ensureBucket } from "@/lib/storage";
import { validateUpload } from "@/lib/api/media";

const SAFE_SUFFIX_RE = /^[a-zA-Z0-9_-]+$/;
const FALLBACK_SUFFIX = "upload";

export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();

    const body = (await req.json()) as {
      contentType?: unknown;
      ext?: unknown;
      suffix?: unknown;
      size?: unknown;
    };
    const { contentType, size, suffix: rawSuffix } = body;

    // Upload safety: type allowlist + size cap, enforced BEFORE presigning.
    const { ext: safeExt } = validateUpload({ contentType, size });

    // Sanitize suffix: keep only [a-zA-Z0-9_-], fallback to fixed token
    const suffixStr = typeof rawSuffix === "string" ? rawSuffix : "";
    const safeSuffix = SAFE_SUFFIX_RE.test(suffixStr) ? suffixStr : FALLBACK_SUFFIX;

    await ensureBucket();

    const objectKey = newMediaKey(uid, safeExt, safeSuffix);
    const uploadUrl = await presignPut(objectKey, contentType as string);

    return Response.json({ uploadUrl, objectKey }, { status: 200 });
  });
}
