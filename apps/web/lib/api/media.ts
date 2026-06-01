import { presignGet } from "@/lib/storage";

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
