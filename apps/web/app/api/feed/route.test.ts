// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser, createChallenge } from "../../../test/db";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/storage", () => ({
  presignGet: vi.fn().mockResolvedValue("https://signed-get"),
  presignPut: vi.fn().mockResolvedValue("https://signed-put"),
  newMediaKey: vi.fn(),
  ensureBucket: vi.fn(),
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

describe("GET /api/feed", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty feed when viewer follows nobody", async () => {
    const alice = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("returns followees' PUBLIC activities", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    // Alice follows Bob
    await prisma.follow.create({ data: { followerId: alice.id, followeeId: bob.id } });

    const challenge = await createChallenge(bob.id, {
      visibility: "PUBLIC",
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    vi.mocked(requireUser).mockResolvedValue(alice.id);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].userId).toBe(bob.id);
    expect(body[0].challenge).toBeDefined();
    expect(body[0].user).toBeDefined();
  });
});
