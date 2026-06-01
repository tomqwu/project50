// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser, createChallenge } from "../../../../../test/db";

// Use fake renderer so no Chromium is needed
process.env.RECAP_FAKE = "1";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/storage", () => ({
  presignGet: vi.fn().mockResolvedValue("https://signed-get/recap.mp4"),
  presignPut: vi.fn().mockResolvedValue("https://signed-put"),
  putObject: vi.fn().mockResolvedValue(undefined),
  newMediaKey: vi.fn(),
  ensureBucket: vi.fn(),
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { POST, GET } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
  // Re-apply the mock defaults after resetAllMocks
  const storage = await import("@/lib/storage");
  vi.mocked(storage.presignGet).mockResolvedValue("https://signed-get/recap.mp4");
  vi.mocked(storage.putObject).mockResolvedValue(undefined);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postReq(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── POST /api/challenges/[id]/recap ───────────────────────────────────────

describe("POST /api/challenges/[id]/recap", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(postReq({ kind: "DAY" }), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("returns 422 INVALID_KIND when kind is missing", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const challenge = await createChallenge(user.id);

    const res = await POST(postReq({}), makeCtx(challenge.id));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_KIND" });
  });

  it("returns 422 INVALID_KIND when kind is not in RECAP_KINDS", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const challenge = await createChallenge(user.id);

    const res = await POST(postReq({ kind: "MONTHLY" }), makeCtx(challenge.id));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_KIND" });
  });

  it("returns 404 when challenge does not exist", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await POST(postReq({ kind: "DAY" }), makeCtx("nonexistent-id"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "CHALLENGE_NOT_FOUND" });
  });

  it("returns 403 FORBIDDEN when user is not the owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const other = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(other.id);
    const challenge = await createChallenge(owner.id);

    const res = await POST(postReq({ kind: "DAY" }), makeCtx(challenge.id));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
  });

  it("returns 201 with recapId, kind, and url for valid DAY request", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id);

    const res = await POST(postReq({ kind: "DAY" }), makeCtx(challenge.id));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.recapId).toBeTruthy();
    expect(body.kind).toBe("DAY");
    expect(body.url).toBe("https://signed-get/recap.mp4");

    // Verify DB row was created
    const row = await prisma.recap.findUnique({ where: { id: body.recapId } });
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("DAY");
  });

  it("returns 201 for WEEK kind", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id);

    const res = await POST(postReq({ kind: "WEEK" }), makeCtx(challenge.id));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.kind).toBe("WEEK");
  });

  it("returns 201 for FIFTY kind", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id);

    const res = await POST(postReq({ kind: "FIFTY" }), makeCtx(challenge.id));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.kind).toBe("FIFTY");
  });
});

// ─── GET /api/challenges/[id]/recap ────────────────────────────────────────

describe("GET /api/challenges/[id]/recap", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await GET(new Request("http://localhost"), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when challenge does not exist", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await GET(new Request("http://localhost"), makeCtx("nonexistent-id"));
    expect(res.status).toBe(404);
  });

  it("returns empty array when no recaps exist", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id);

    const res = await GET(new Request("http://localhost"), makeCtx(challenge.id));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("returns recaps with signed URLs, newest first", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id);

    await prisma.recap.create({
      data: { challengeId: challenge.id, kind: "DAY", objectKey: "media/a/day.mp4" },
    });
    await new Promise((r) => setTimeout(r, 5));
    await prisma.recap.create({
      data: { challengeId: challenge.id, kind: "WEEK", objectKey: "media/a/week.mp4" },
    });

    const res = await GET(new Request("http://localhost"), makeCtx(challenge.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].kind).toBe("WEEK"); // newest first
    expect(body[1].kind).toBe("DAY");
    expect(body[0].url).toBe("https://signed-get/recap.mp4");
  });

  it("returns 404 for PRIVATE challenge viewed by non-owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const viewer = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(viewer.id);
    const challenge = await createChallenge(owner.id, { visibility: "PRIVATE" });

    const res = await GET(new Request("http://localhost"), makeCtx(challenge.id));
    expect(res.status).toBe(404);
  });

  it("returns recaps for the owner of a PRIVATE challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id, { visibility: "PRIVATE" });
    await prisma.recap.create({
      data: { challengeId: challenge.id, kind: "FIFTY", objectKey: "media/a/fifty.mp4" },
    });

    const res = await GET(new Request("http://localhost"), makeCtx(challenge.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].kind).toBe("FIFTY");
  });
});
