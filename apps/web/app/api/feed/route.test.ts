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

/** Build a NextRequest-like object for GET with the given query string. */
function reqWith(query = ""): import("next/server").NextRequest {
  return {
    nextUrl: new URL(`http://localhost/api/feed${query}`),
  } as unknown as import("next/server").NextRequest;
}

describe("GET /api/feed", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await GET(reqWith());
    expect(res.status).toBe(401);
  });

  it("returns empty page when viewer follows nobody", async () => {
    const alice = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);

    const res = await GET(reqWith());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: [], nextCursor: null });
  });

  it("returns followees' PUBLIC activities under { items, nextCursor }", async () => {
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
    const res = await GET(reqWith());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
    expect(body.items[0].userId).toBe(bob.id);
    expect(body.items[0].challenge).toBeDefined();
    expect(body.items[0].user).toBeDefined();
  });

  it("paginates via ?limit= and ?cursor= query params", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    await prisma.follow.create({ data: { followerId: alice.id, followeeId: bob.id } });

    const challenge = await createChallenge(bob.id, {
      visibility: "PUBLIC",
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });
    for (let i = 0; i < 5; i++) {
      await prisma.activity.create({
        data: {
          challengeId: challenge.id,
          userId: bob.id,
          dayKey: "2026-06-01",
          done: true,
          createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)),
        },
      });
    }

    vi.mocked(requireUser).mockResolvedValue(alice.id);

    const firstRes = await GET(reqWith("?limit=2"));
    const first = await firstRes.json();
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const secondRes = await GET(
      reqWith(`?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`),
    );
    const second = await secondRes.json();
    expect(second.items).toHaveLength(2);
    // No overlap with the first page.
    const firstIds = new Set(first.items.map((a: { id: string }) => a.id));
    expect(second.items.some((a: { id: string }) => firstIds.has(a.id))).toBe(false);
  });

  it("clamps an over-cap ?limit= to 50", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    await prisma.follow.create({ data: { followerId: alice.id, followeeId: bob.id } });

    const challenge = await createChallenge(bob.id, {
      visibility: "PUBLIC",
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });
    for (let i = 0; i < 55; i++) {
      await prisma.activity.create({
        data: {
          challengeId: challenge.id,
          userId: bob.id,
          dayKey: "2026-06-01",
          done: true,
          createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)),
        },
      });
    }

    vi.mocked(requireUser).mockResolvedValue(alice.id);
    const res = await GET(reqWith("?limit=999"));
    const body = await res.json();
    expect(body.items).toHaveLength(50);
  });

  it("ignores a non-numeric ?limit= and applies the default", async () => {
    const alice = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);
    const res = await GET(reqWith("?limit=abc"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: [], nextCursor: null });
  });
});
