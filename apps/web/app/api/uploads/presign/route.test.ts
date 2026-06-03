import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/lib/storage", () => ({
  presignPut: vi.fn().mockResolvedValue("https://signed-put-url"),
  newMediaKey: vi.fn((userId: string, ext: string, suffix: string) => `media/${userId}/${suffix}.${ext}`),
  ensureBucket: vi.fn().mockResolvedValue(undefined),
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { presignPut, newMediaKey, ensureBucket } from "@/lib/storage";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/api/media";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureBucket).mockResolvedValue(undefined);
  vi.mocked(presignPut).mockResolvedValue("https://signed-put-url");
  vi.mocked(newMediaKey).mockImplementation(
    (userId: string, ext: string, suffix: string) => `media/${userId}/${suffix}.${ext}`,
  );
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/uploads/presign", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(makeRequest({ contentType: "image/jpeg", suffix: "abc" }));
    expect(res.status).toBe(401);
  });

  it("returns 422 unsupported_media_type for a disallowed image type (bmp)", async () => {
    vi.mocked(requireUser).mockResolvedValue("u1");
    const res = await POST(makeRequest({ contentType: "image/bmp", suffix: "abc" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "unsupported_media_type" });
    // Rejected BEFORE any presigned URL is issued.
    expect(presignPut).not.toHaveBeenCalled();
    expect(ensureBucket).not.toHaveBeenCalled();
  });

  it("returns 422 unsupported_media_type for text/html", async () => {
    vi.mocked(requireUser).mockResolvedValue("u1");
    const res = await POST(makeRequest({ contentType: "text/html", suffix: "abc" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "unsupported_media_type" });
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("returns 422 unsupported_media_type when contentType is missing", async () => {
    vi.mocked(requireUser).mockResolvedValue("u1");
    const res = await POST(makeRequest({ suffix: "abc" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "unsupported_media_type" });
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("returns 200 with uploadUrl and objectKey for image/jpeg", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "image/jpeg", suffix: "mysuffix" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uploadUrl).toBe("https://signed-put-url");
    expect(body.objectKey).toBe("media/user1/mysuffix.jpg");
  });

  it("returns 200 with uploadUrl and objectKey for image/png", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "image/png", suffix: "s1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/s1.png");
  });

  it("returns 200 with uploadUrl and objectKey for image/webp", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "image/webp", suffix: "s2" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/s2.webp");
  });

  it("returns 200 for image/gif (now an allowed media type)", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "image/gif", suffix: "anim" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/anim.gif");
  });

  it("returns 200 for video/mp4 with a video object key", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "video/mp4", suffix: "clip" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/clip.mp4");
  });

  it("returns 200 for video/quicktime (.mov)", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "video/quicktime", suffix: "v" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/v.mov");
  });

  it("returns 422 file_too_large for an oversize image", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(
      makeRequest({ contentType: "image/jpeg", suffix: "big", size: MAX_IMAGE_BYTES + 1 }),
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "file_too_large" });
    expect(presignPut).not.toHaveBeenCalled();
    expect(ensureBucket).not.toHaveBeenCalled();
  });

  it("returns 422 file_too_large for an oversize video", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(
      makeRequest({ contentType: "video/mp4", suffix: "huge", size: MAX_VIDEO_BYTES + 1 }),
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "file_too_large" });
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("accepts an image exactly at the size limit (boundary)", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(
      makeRequest({ contentType: "image/jpeg", suffix: "edge", size: MAX_IMAGE_BYTES }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/edge.jpg");
    expect(presignPut).toHaveBeenCalledOnce();
  });

  it("sanitizes suffix: falls back to 'upload' for empty suffix", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "image/jpeg", suffix: "" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/upload.jpg");
  });

  it("sanitizes suffix: falls back to 'upload' for unsafe suffix with slashes", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "image/jpeg", suffix: "../../etc/passwd" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/upload.jpg");
  });

  it("sanitizes suffix: falls back to 'upload' when suffix is not a string", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "image/jpeg", suffix: 12345 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/upload.jpg");
  });

  it("allows valid alphanumeric+dash+underscore suffix", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    const res = await POST(makeRequest({ contentType: "image/jpeg", suffix: "abc-123_xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("media/user1/abc-123_xyz.jpg");
  });

  it("calls ensureBucket before presigning", async () => {
    vi.mocked(requireUser).mockResolvedValue("user1");
    await POST(makeRequest({ contentType: "image/jpeg", suffix: "s" }));
    expect(ensureBucket).toHaveBeenCalledOnce();
    expect(presignPut).toHaveBeenCalledOnce();
  });

  it("uses user's id in the object key (security: namespaced per user)", async () => {
    vi.mocked(requireUser).mockResolvedValue("specific-user-id");
    const res = await POST(makeRequest({ contentType: "image/png", suffix: "photo" }));
    const body = await res.json();
    expect(body.objectKey).toContain("specific-user-id");
    expect(body.objectKey).toMatch(/^media\/specific-user-id\//);
  });
});
