import { presignGet } from "@/lib/storage";
import { unprocessable } from "@/lib/api/http";

/**
 * Upload safety: server-side guardrails enforced at presign time.
 *
 * We only issue a presigned PUT URL for an allowed media content-type within
 * the per-category size budget. This is a type/size safety gate — NOT content
 * moderation. FOLLOW-UP: AI content moderation (e.g. nudity / violence
 * classification) requires an external service (Rekognition / Hive / etc.) and
 * is out of scope here; wire it post-upload before media is shown publicly.
 */

/** Max bytes for an image upload (jpeg/png/webp/gif). */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
/** Max bytes for a video upload (mp4/webm/quicktime). */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

interface UploadTypeSpec {
  /** File extension used when building the object key. */
  ext: string;
  /** Upper byte limit for this media category. */
  maxBytes: number;
}

/**
 * Allowlist of accepted upload content-types → object-key extension + size cap.
 * Anything not present here is rejected before a presigned URL is issued.
 */
export const ALLOWED_UPLOAD_TYPES: Readonly<Record<string, UploadTypeSpec>> = {
  "image/jpeg": { ext: "jpg", maxBytes: MAX_IMAGE_BYTES },
  "image/png": { ext: "png", maxBytes: MAX_IMAGE_BYTES },
  "image/webp": { ext: "webp", maxBytes: MAX_IMAGE_BYTES },
  "image/gif": { ext: "gif", maxBytes: MAX_IMAGE_BYTES },
  "video/mp4": { ext: "mp4", maxBytes: MAX_VIDEO_BYTES },
  "video/webm": { ext: "webm", maxBytes: MAX_VIDEO_BYTES },
  "video/quicktime": { ext: "mov", maxBytes: MAX_VIDEO_BYTES },
};

export interface UploadCandidate {
  contentType: unknown;
  /** Declared byte size of the file, when the client provides it. */
  size?: unknown;
}

/**
 * Validate an upload request against the type allowlist and size budget.
 *
 * Throws a 422 HttpError (via `unprocessable`) BEFORE any presigned URL is
 * issued when the content-type is unsupported or the declared size exceeds the
 * category limit. On success returns the safe file extension for the key.
 *
 * `size` is validated only when the client declares it as a finite, non-negative
 * number; a missing/non-numeric size is allowed through (the type gate still
 * applies). Boundary: a size exactly equal to the limit is accepted.
 */
export function validateUpload({ contentType, size }: UploadCandidate): {
  ext: string;
} {
  if (typeof contentType !== "string") {
    unprocessable("unsupported_media_type");
  }
  const spec = ALLOWED_UPLOAD_TYPES[contentType];
  if (!spec) {
    unprocessable("unsupported_media_type");
  }

  if (typeof size === "number" && Number.isFinite(size) && size >= 0) {
    if (size > spec.maxBytes) {
      unprocessable("file_too_large", { maxBytes: spec.maxBytes });
    }
  }

  return { ext: spec.ext };
}

export interface MediaRow {
  id: string;
  activityId: string;
  objectKey: string;
  width: number;
  height: number;
  order: number;
}

export interface MediaRowWithUrl extends MediaRow {
  url: string;
}

/**
 * Attach signed view URLs to each media row.
 * Accepts an array of activities (or activity-like objects) that have a `media` array.
 */
export async function withMediaUrls<
  T extends { media: MediaRow[] },
>(rows: T[]): Promise<(Omit<T, "media"> & { media: MediaRowWithUrl[] })[]> {
  return Promise.all(
    rows.map(async (row) => {
      const mediaWithUrls = await Promise.all(
        row.media.map(async (m) => ({
          ...m,
          url: await presignGet(m.objectKey),
        })),
      );
      return { ...row, media: mediaWithUrls };
    }),
  );
}
