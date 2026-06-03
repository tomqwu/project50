// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../test/db";

// Mock session so we can control auth
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { GET, PATCH, DELETE } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/account", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns the signed-in user's account", async () => {
    const user = await createUser({ handle: "alice", displayName: "Alice A" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      handle: "alice",
      displayName: "Alice A",
    });
  });
});

describe("PATCH /api/account", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await PATCH(patchRequest({ displayName: "X" }));
    expect(res.status).toBe(401);
  });

  it("updates and returns the new account", async () => {
    const user = await createUser({ handle: "alice", displayName: "Alice A" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await PATCH(
      patchRequest({ displayName: "Alice B", handle: "alice_b" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      handle: "alice_b",
      displayName: "Alice B",
    });
  });

  it("returns 422 invalid_handle for bad handle", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await PATCH(patchRequest({ handle: "no" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "invalid_handle" });
  });

  it("returns 422 handle_taken when handle belongs to another user", async () => {
    const user = await createUser({ handle: "alice" });
    await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await PATCH(patchRequest({ handle: "bob" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "handle_taken" });
  });
});

describe("DELETE /api/account", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await DELETE();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("deletes the signed-in user and returns ok", async () => {
    const user = await createUser({ handle: "alice", displayName: "Alice A" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await DELETE();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });
});
