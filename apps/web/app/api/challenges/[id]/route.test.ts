// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser, createChallenge } from "../../../../test/db";

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

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/challenges/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await GET(new Request("http://localhost"), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing challenge", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const res = await GET(new Request("http://localhost"), makeCtx("nonexistent"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "CHALLENGE_NOT_FOUND" });
  });

  it("returns challenge with streaks for PUBLIC challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const viewer = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id, { visibility: "PUBLIC" });

    vi.mocked(requireUser).mockResolvedValue(viewer.id);
    const res = await GET(new Request("http://localhost"), makeCtx(challenge.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(challenge.id);
    expect(typeof body.currentStreak).toBe("number");
    expect(typeof body.longestStreak).toBe("number");
  });

  it("returns 404 for PRIVATE challenge viewed by non-owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const stranger = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id, { visibility: "PRIVATE" });

    vi.mocked(requireUser).mockResolvedValue(stranger.id);
    const res = await GET(new Request("http://localhost"), makeCtx(challenge.id));
    expect(res.status).toBe(404);
  });
});
