/**
 * Unit tests for photo.ts.
 * Mocks: expo-image-picker (the native launch functions pickImageFromLibrary and
 *        pickImageFromCamera are excluded from coverage — see COVERAGE.md).
 * Tests: parsePickerResult (full coverage), uploadPhoto (apiClient + fetch mocked).
 */

import type { ImagePickerResult } from "expo-image-picker";

// Mock expo-image-picker
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));

import { parsePickerResult, uploadPhoto } from "./photo";

// Mock ApiClient
const mockPresignUpload = jest.fn();
const mockApiClient = {
  presignUpload: mockPresignUpload,
};

const gFetch = (): jest.Mock => global.fetch as jest.Mock;

beforeEach(() => {
  global.fetch = jest.fn() as typeof fetch;
  jest.clearAllMocks();
});

// ─── Helper to build asset objects ─────────────────────────────────────────────

function makeAsset(overrides: Partial<{ uri: string; width: number; height: number; mimeType?: string }> = {}) {
  return {
    uri: "file:///tmp/photo.jpg",
    width: 1080,
    height: 720,
    mimeType: "image/jpeg" as string | undefined,
    ...overrides,
  };
}

// ─── parsePickerResult ────────────────────────────────────────────────────────

describe("parsePickerResult", () => {
  it("returns null when result is cancelled (assets: null)", () => {
    const result: ImagePickerResult = { canceled: true, assets: null };
    expect(parsePickerResult(result)).toBeNull();
  });

  it("returns null when assets is empty array", () => {
    const result: ImagePickerResult = { canceled: false, assets: [] };
    expect(parsePickerResult(result)).toBeNull();
  });

  it("returns PickedImage when a valid asset is present", () => {
    const result: ImagePickerResult = {
      canceled: false,
      assets: [makeAsset()],
    };
    const image = parsePickerResult(result);
    expect(image).not.toBeNull();
    expect(image!.uri).toBe("file:///tmp/photo.jpg");
    expect(image!.width).toBe(1080);
    expect(image!.height).toBe(720);
    expect(image!.mimeType).toBe("image/jpeg");
  });

  it("falls back to image/jpeg when mimeType is absent", () => {
    const result: ImagePickerResult = {
      canceled: false,
      assets: [makeAsset({ mimeType: undefined })],
    };
    const image = parsePickerResult(result);
    expect(image!.mimeType).toBe("image/jpeg");
  });

  it("returns only the first asset when multiple provided", () => {
    const result: ImagePickerResult = {
      canceled: false,
      assets: [
        makeAsset({ uri: "file:///tmp/first.jpg" }),
        makeAsset({ uri: "file:///tmp/second.jpg" }),
      ],
    };
    const image = parsePickerResult(result);
    expect(image!.uri).toBe("file:///tmp/first.jpg");
  });

  it("handles PNG mime type", () => {
    const result: ImagePickerResult = {
      canceled: false,
      assets: [makeAsset({ uri: "file:///tmp/photo.png", mimeType: "image/png" })],
    };
    const image = parsePickerResult(result);
    expect(image!.mimeType).toBe("image/png");
  });

  it("handles webp mime type", () => {
    const result: ImagePickerResult = {
      canceled: false,
      assets: [makeAsset({ uri: "file:///tmp/photo.webp", mimeType: "image/webp" })],
    };
    const image = parsePickerResult(result);
    expect(image!.mimeType).toBe("image/webp");
  });

  it("captures correct width and height", () => {
    const result: ImagePickerResult = {
      canceled: false,
      assets: [makeAsset({ width: 4032, height: 3024 })],
    };
    const image = parsePickerResult(result);
    expect(image!.width).toBe(4032);
    expect(image!.height).toBe(3024);
  });
});

// ─── uploadPhoto ──────────────────────────────────────────────────────────────

describe("uploadPhoto", () => {
  const mockBlob = { type: "image/jpeg", size: 100000 };

  it("presigns upload, PUTs the file, returns objectKey + dimensions", async () => {
    mockPresignUpload.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/presigned-url",
      objectKey: "media/u1/photo-shot.jpg",
    });
    gFetch()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob) })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await uploadPhoto(
      mockApiClient as never,
      "file:///tmp/photo.jpg",
      "image/jpeg",
      "jpg",
      "shot",
      1080,
      720,
    );

    expect(result).toEqual({
      objectKey: "media/u1/photo-shot.jpg",
      width: 1080,
      height: 720,
    });
  });

  it("calls presignUpload with correct arguments", async () => {
    mockPresignUpload.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/presigned",
      objectKey: "media/u1/photo.jpg",
    });
    gFetch()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob) })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await uploadPhoto(
      mockApiClient as never,
      "file:///tmp/photo.jpg",
      "image/jpeg",
      "jpg",
      "my-suffix",
      100,
      200,
    );

    expect(mockPresignUpload).toHaveBeenCalledWith("image/jpeg", "jpg", "my-suffix");
  });

  it("PUTs to the presigned URL with correct Content-Type", async () => {
    mockPresignUpload.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/presigned-put",
      objectKey: "media/u1/photo.jpg",
    });
    gFetch()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob) })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await uploadPhoto(
      mockApiClient as never,
      "file:///tmp/photo.jpg",
      "image/webp",
      "webp",
      "shot",
      100,
      200,
    );

    const calls = gFetch().mock.calls as Array<[string, RequestInit]>;
    expect(calls[1]![0]).toBe("https://s3.example.com/presigned-put");
    expect(calls[1]![1]!.method).toBe("PUT");
    expect((calls[1]![1]!.headers as Record<string, string>)["Content-Type"]).toBe("image/webp");
  });

  it("spreads Azure uploadHeaders (x-ms-blob-type) onto the PUT", async () => {
    mockPresignUpload.mockResolvedValueOnce({
      uploadUrl: "https://acct.blob.core.windows.net/cont/key?sas",
      objectKey: "media/u1/photo.jpg",
      uploadHeaders: {
        "content-type": "image/jpeg",
        "x-ms-blob-type": "BlockBlob",
      },
    });
    gFetch()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob) })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await uploadPhoto(
      mockApiClient as never,
      "file:///tmp/photo.jpg",
      "image/jpeg",
      "jpg",
      "shot",
      100,
      200,
    );

    const calls = gFetch().mock.calls as Array<[string, RequestInit]>;
    expect(calls[1]![1]!.headers).toEqual({
      "content-type": "image/jpeg",
      "x-ms-blob-type": "BlockBlob",
    });
  });

  it("uses S3 uploadHeaders (content-type only) when the response provides them", async () => {
    mockPresignUpload.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/presigned-put",
      objectKey: "media/u1/photo.jpg",
      uploadHeaders: { "content-type": "image/png" },
    });
    gFetch()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob) })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await uploadPhoto(
      mockApiClient as never,
      "file:///tmp/photo.png",
      "image/png",
      "png",
      "shot",
      100,
      200,
    );

    const calls = gFetch().mock.calls as Array<[string, RequestInit]>;
    expect(calls[1]![1]!.headers).toEqual({ "content-type": "image/png" });
  });

  it("fetches local file URI first, then PUTs the blob", async () => {
    mockPresignUpload.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/presigned",
      objectKey: "media/u1/img.jpg",
    });
    const blob = { type: "image/jpeg", size: 50000 };
    gFetch()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(blob) })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await uploadPhoto(
      mockApiClient as never,
      "file:///tmp/img.jpg",
      "image/jpeg",
      "jpg",
      "img",
      320,
      240,
    );

    const calls = gFetch().mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]![0]).toBe("file:///tmp/img.jpg");
    expect(calls[1]![1]!.body).toBe(blob);
  });

  it("throws when the PUT upload fails (403)", async () => {
    mockPresignUpload.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/presigned",
      objectKey: "media/u1/photo.jpg",
    });
    gFetch()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob) })
      .mockResolvedValueOnce({ ok: false, status: 403 });

    await expect(
      uploadPhoto(
        mockApiClient as never,
        "file:///tmp/photo.jpg",
        "image/jpeg",
        "jpg",
        "shot",
        100,
        200,
      ),
    ).rejects.toThrow("Photo upload failed: 403");
  });

  it("throws when PUT returns 500", async () => {
    mockPresignUpload.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/presigned",
      objectKey: "media/u1/photo.jpg",
    });
    gFetch()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob) })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(
      uploadPhoto(
        mockApiClient as never,
        "file:///tmp/photo.jpg",
        "image/jpeg",
        "jpg",
        "shot",
        100,
        200,
      ),
    ).rejects.toThrow("Photo upload failed: 500");
  });

  it("throws when presignUpload fails", async () => {
    mockPresignUpload.mockRejectedValueOnce(new Error("presign failed"));

    await expect(
      uploadPhoto(
        mockApiClient as never,
        "file:///tmp/photo.jpg",
        "image/jpeg",
        "jpg",
        "shot",
        100,
        200,
      ),
    ).rejects.toThrow("presign failed");
  });

  it("passes dimensions from arguments to return value", async () => {
    mockPresignUpload.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/presigned",
      objectKey: "media/u1/img.jpg",
    });
    gFetch()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob) })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await uploadPhoto(
      mockApiClient as never,
      "file:///tmp/img.jpg",
      "image/jpeg",
      "jpg",
      "img",
      4032,
      3024,
    );

    expect(result.width).toBe(4032);
    expect(result.height).toBe(3024);
  });
});
