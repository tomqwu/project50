// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryRaw, mockCheckStorage } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockCheckStorage: vi.fn(),
}));
vi.mock("@project50/db", () => ({ prisma: { $queryRaw: mockQueryRaw } }));
vi.mock("@/lib/storage", () => ({ checkStorage: mockCheckStorage }));

import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/ready", () => {
  it("returns 200 ready when the database and storage are both reachable", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockCheckStorage.mockResolvedValue(true);

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "ready",
      checks: { database: true, storage: true },
    });
  });

  it("returns 503 not_ready when storage is unreachable", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockCheckStorage.mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      status: "not_ready",
      checks: { database: true, storage: false },
    });
  });

  it("returns 503 not_ready when the database query fails", async () => {
    mockQueryRaw.mockRejectedValue(new Error("db down"));
    mockCheckStorage.mockResolvedValue(true);

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      status: "not_ready",
      checks: { database: false, storage: true },
    });
  });
});
