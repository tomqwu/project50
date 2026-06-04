// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser, createChallenge } from "../../../../test/db";

// Mock session so we can control auth.
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { GET } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/account/export", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns the signed-in user's export with attachment headers", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });
    await createChallenge(alice.id, { title: "Run" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="project50-export.json"',
    );

    const body = await res.json();
    expect(body.profile).toMatchObject({ handle: "alice", displayName: "Alice A" });
    expect(body.challenges).toHaveLength(1);
    expect(body.challenges[0].title).toBe("Run");
  });
});
