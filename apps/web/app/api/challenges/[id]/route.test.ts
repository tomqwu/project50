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
import { GET, PATCH, DELETE } from "./route";

function jsonReq(body: unknown) {
  return new Request("http://localhost", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

describe("PATCH /api/challenges/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await PATCH(jsonReq({ title: "x" }), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("updates editable fields for the owner and returns 200", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id, {
      title: "Old",
      goalType: "TARGET",
      dailyTarget: 5,
      visibility: "PUBLIC",
    });

    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const res = await PATCH(
      jsonReq({ title: "New", unit: "miles", dailyTarget: 12, visibility: "PRIVATE" }),
      makeCtx(challenge.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("New");
    expect(body.unit).toBe("miles");
    expect(body.dailyTarget).toBe(12);
    expect(body.visibility).toBe("PRIVATE");
  });

  it("ignores non-editable fields in the body", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id, { title: "Old" });

    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const res = await PATCH(
      jsonReq({ title: "Renamed", ownerId: "hacker", goalType: "BINARY" }),
      makeCtx(challenge.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Renamed");
    expect(body.ownerId).toBe(owner.id);
  });

  it("returns 404 when the requester is not the owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const stranger = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id, { title: "Old" });

    vi.mocked(requireUser).mockResolvedValue(stranger.id);
    const res = await PATCH(jsonReq({ title: "Hacked" }), makeCtx(challenge.id));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "CHALLENGE_NOT_FOUND" });
  });

  it("returns 404 for a missing challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const res = await PATCH(jsonReq({ title: "x" }), makeCtx("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 422 for an invalid patch (blank title)", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id, { title: "Old" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const res = await PATCH(jsonReq({ title: "   " }), makeCtx(challenge.id));
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/challenges/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("deletes the owner's challenge and returns 200", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id, { title: "Old" });

    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), makeCtx(challenge.id));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });

    const found = await prisma.challenge.findUnique({ where: { id: challenge.id } });
    expect(found).toBeNull();
  });

  it("returns 404 when the requester is not the owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const stranger = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id, { title: "Old" });

    vi.mocked(requireUser).mockResolvedValue(stranger.id);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), makeCtx(challenge.id));
    expect(res.status).toBe(404);

    const found = await prisma.challenge.findUnique({ where: { id: challenge.id } });
    expect(found).not.toBeNull();
  });

  it("returns 404 for a missing challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), makeCtx("nonexistent"));
    expect(res.status).toBe(404);
  });
});
