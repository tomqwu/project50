import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/lib/storage", () => ({
  presignGet: vi.fn().mockResolvedValue("https://signed-get"),
}));

import { presignGet } from "@/lib/storage";
import {
  withMediaUrls,
  validateUpload,
  ALLOWED_UPLOAD_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "./media";
import { HttpError } from "@/lib/api/http";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(presignGet).mockResolvedValue("https://signed-get");
});

const makeMedia = (objectKey: string, order: number) => ({
  id: `m-${order}`,
  activityId: "a1",
  objectKey,
  width: 800,
  height: 600,
  order,
});

describe("withMediaUrls", () => {
  it("returns empty array unchanged when rows have no media", async () => {
    const rows = [{ id: "a1", media: [] }];
    const result = await withMediaUrls(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.media).toHaveLength(0);
  });

  it("attaches signed URL to each media item", async () => {
    const rows = [
      {
        id: "a1",
        media: [makeMedia("media/u1/img.jpg", 0)],
      },
    ];
    const result = await withMediaUrls(rows);
    expect(result[0]!.media[0]!.url).toBe("https://signed-get");
    expect(presignGet).toHaveBeenCalledWith("media/u1/img.jpg");
  });

  it("processes multiple media items per activity", async () => {
    vi.mocked(presignGet)
      .mockResolvedValueOnce("https://url-0")
      .mockResolvedValueOnce("https://url-1");

    const rows = [
      {
        id: "a1",
        media: [makeMedia("media/u1/img0.jpg", 0), makeMedia("media/u1/img1.jpg", 1)],
      },
    ];
    const result = await withMediaUrls(rows);
    expect(result[0]!.media[0]!.url).toBe("https://url-0");
    expect(result[0]!.media[1]!.url).toBe("https://url-1");
    expect(presignGet).toHaveBeenCalledTimes(2);
  });

  it("processes multiple activities each with media", async () => {
    vi.mocked(presignGet)
      .mockResolvedValueOnce("https://url-a1")
      .mockResolvedValueOnce("https://url-a2");

    const rows = [
      { id: "a1", media: [makeMedia("media/u1/a.jpg", 0)] },
      { id: "a2", media: [makeMedia("media/u1/b.jpg", 0)] },
    ];
    const result = await withMediaUrls(rows);
    expect(result[0]!.media[0]!.url).toBe("https://url-a1");
    expect(result[1]!.media[0]!.url).toBe("https://url-a2");
  });

  it("preserves other fields on the row", async () => {
    const rows = [
      { id: "a1", dayKey: "2026-06-01", extra: "value", media: [makeMedia("media/u1/img.jpg", 0)] },
    ];
    const result = await withMediaUrls(rows);
    expect(result[0]!.id).toBe("a1");
    expect(result[0]!.dayKey).toBe("2026-06-01");
    expect(result[0]!.extra).toBe("value");
  });

  it("preserves media fields (id, width, height, order, objectKey)", async () => {
    const rows = [
      { id: "a1", media: [makeMedia("media/u1/img.jpg", 2)] },
    ];
    const result = await withMediaUrls(rows);
    const m = result[0]!.media[0]!;
    expect(m.id).toBe("m-2");
    expect(m.width).toBe(800);
    expect(m.height).toBe(600);
    expect(m.order).toBe(2);
    expect(m.objectKey).toBe("media/u1/img.jpg");
  });

  it("returns empty array for no rows", async () => {
    const result = await withMediaUrls([]);
    expect(result).toHaveLength(0);
    expect(presignGet).not.toHaveBeenCalled();
  });
});

describe("validateUpload", () => {
  it("accepts each allowed type and returns its extension", () => {
    expect(validateUpload({ contentType: "image/jpeg" })).toEqual({ ext: "jpg" });
    expect(validateUpload({ contentType: "image/png" })).toEqual({ ext: "png" });
    expect(validateUpload({ contentType: "image/webp" })).toEqual({ ext: "webp" });
    expect(validateUpload({ contentType: "image/gif" })).toEqual({ ext: "gif" });
    expect(validateUpload({ contentType: "video/mp4" })).toEqual({ ext: "mp4" });
    expect(validateUpload({ contentType: "video/webm" })).toEqual({ ext: "webm" });
    expect(validateUpload({ contentType: "video/quicktime" })).toEqual({ ext: "mov" });
  });

  it("rejects a non-string content-type with 422 unsupported_media_type", () => {
    try {
      validateUpload({ contentType: undefined });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(422);
      expect((err as HttpError).code).toBe("unsupported_media_type");
    }
  });

  it("rejects a disallowed content-type with 422 unsupported_media_type", () => {
    try {
      validateUpload({ contentType: "application/pdf" });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(422);
      expect((err as HttpError).code).toBe("unsupported_media_type");
    }
  });

  it("rejects an oversize image with 422 file_too_large and the limit in detail", () => {
    try {
      validateUpload({ contentType: "image/png", size: MAX_IMAGE_BYTES + 1 });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(422);
      expect((err as HttpError).code).toBe("file_too_large");
      expect((err as HttpError).detail).toEqual({ maxBytes: MAX_IMAGE_BYTES });
    }
  });

  it("rejects an oversize video with 422 file_too_large", () => {
    try {
      validateUpload({ contentType: "video/mp4", size: MAX_VIDEO_BYTES + 1 });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as HttpError).code).toBe("file_too_large");
      expect((err as HttpError).detail).toEqual({ maxBytes: MAX_VIDEO_BYTES });
    }
  });

  it("accepts a size exactly at the limit (boundary)", () => {
    expect(validateUpload({ contentType: "image/jpeg", size: MAX_IMAGE_BYTES })).toEqual({
      ext: "jpg",
    });
    expect(validateUpload({ contentType: "video/mp4", size: MAX_VIDEO_BYTES })).toEqual({
      ext: "mp4",
    });
  });

  it("accepts size 0 (empty boundary) for an allowed type", () => {
    expect(validateUpload({ contentType: "image/jpeg", size: 0 })).toEqual({ ext: "jpg" });
  });

  it("ignores a non-numeric or non-finite size (type gate still applies)", () => {
    expect(validateUpload({ contentType: "image/jpeg", size: "1234" })).toEqual({ ext: "jpg" });
    expect(validateUpload({ contentType: "image/jpeg", size: NaN })).toEqual({ ext: "jpg" });
    expect(validateUpload({ contentType: "image/jpeg", size: Infinity })).toEqual({ ext: "jpg" });
    expect(validateUpload({ contentType: "image/jpeg", size: -1 })).toEqual({ ext: "jpg" });
  });

  it("exposes the allowlist and size constants", () => {
    expect(Object.keys(ALLOWED_UPLOAD_TYPES)).toContain("image/jpeg");
    expect(Object.keys(ALLOWED_UPLOAD_TYPES)).toContain("video/mp4");
    expect(MAX_IMAGE_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_VIDEO_BYTES).toBe(100 * 1024 * 1024);
  });
});
