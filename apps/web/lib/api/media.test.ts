import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  presignGet: vi.fn().mockResolvedValue("https://signed-get"),
}));

import { presignGet } from "@/lib/storage";
import { withMediaUrls } from "./media";

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
