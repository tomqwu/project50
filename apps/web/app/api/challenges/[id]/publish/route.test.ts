// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll, afterEach } from "vitest";
import { prisma, resetDb, createUser, createChallenge } from "../../../../../test/db";

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
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { POST } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
  const storage = await import("@/lib/storage");
  vi.mocked(storage.presignGet).mockResolvedValue("https://signed-get/recap.mp4");
});

afterEach(() => {
  delete process.env.APP_BASE_URL;
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

describe("POST /api/challenges/[id]/publish", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(postReq({ platform: "FACEBOOK", assetKind: "IMAGE" }), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("returns 422 INVALID_PLATFORM when platform is missing", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const challenge = await createChallenge(user.id);

    const res = await POST(postReq({ assetKind: "IMAGE" }), makeCtx(challenge.id));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_PLATFORM" });
  });

  it("returns 422 INVALID_PLATFORM when platform is invalid", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const challenge = await createChallenge(user.id);

    const res = await POST(postReq({ platform: "TIKTOK", assetKind: "IMAGE" }), makeCtx(challenge.id));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_PLATFORM" });
  });

  it("returns 422 INVALID_ASSET when assetKind is missing", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const challenge = await createChallenge(user.id);

    const res = await POST(postReq({ platform: "FACEBOOK" }), makeCtx(challenge.id));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_ASSET" });
  });

  it("returns 422 INVALID_ASSET when assetKind is invalid", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const challenge = await createChallenge(user.id);

    const res = await POST(postReq({ platform: "FACEBOOK", assetKind: "AUDIO" }), makeCtx(challenge.id));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_ASSET" });
  });

  it("returns 404 when challenge does not exist", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await POST(postReq({ platform: "FACEBOOK", assetKind: "IMAGE" }), makeCtx("nonexistent"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "CHALLENGE_NOT_FOUND" });
  });

  it("returns 403 when user is not the owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const other = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(other.id);
    const challenge = await createChallenge(owner.id, { visibility: "PUBLIC" });

    const res = await POST(postReq({ platform: "FACEBOOK", assetKind: "IMAGE" }), makeCtx(challenge.id));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
  });

  it("returns 422 MUST_BE_PUBLIC for IMAGE on a PRIVATE challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id, { visibility: "PRIVATE" });

    const res = await POST(postReq({ platform: "FACEBOOK", assetKind: "IMAGE" }), makeCtx(challenge.id));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "MUST_BE_PUBLIC" });
  });

  it("returns 404 NO_RECAP for VIDEO when no recap exists", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id, { visibility: "PUBLIC" });

    const res = await POST(postReq({ platform: "FACEBOOK", assetKind: "VIDEO" }), makeCtx(challenge.id));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "NO_RECAP" });
  });

  it("returns 200 with PublishResult for PUBLIC IMAGE (deeplink fallback, unconfigured)", async () => {
    process.env.APP_BASE_URL = "https://project50.app";
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id, { visibility: "PUBLIC" });

    const res = await POST(postReq({ platform: "FACEBOOK", assetKind: "IMAGE" }), makeCtx(challenge.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.method).toBe("DEEPLINK");
    expect(body.shareUrl).toContain("facebook.com/sharer");
  });

  it("returns 200 with WEBSHARE result for WEBSHARE platform", async () => {
    process.env.APP_BASE_URL = "https://project50.app";
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id, { visibility: "PUBLIC" });

    const res = await POST(postReq({ platform: "WEBSHARE", assetKind: "IMAGE" }), makeCtx(challenge.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.method).toBe("WEBSHARE");
  });

  it("returns 200 with deeplink result for VIDEO when recap exists", async () => {
    const owner = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(owner.id);
    const challenge = await createChallenge(owner.id, { visibility: "PUBLIC" });

    await prisma.recap.create({
      data: { challengeId: challenge.id, kind: "DAY", objectKey: "media/a/day.mp4" },
    });

    const res = await POST(postReq({ platform: "FACEBOOK", assetKind: "VIDEO" }), makeCtx(challenge.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.method).toBe("DEEPLINK");
  });
});
