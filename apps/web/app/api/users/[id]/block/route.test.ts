// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../../../test/db";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { POST, DELETE } from "./route";

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

describe("POST /api/users/[id]/block", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(new Request("http://localhost"), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("creates a block edge and returns 201", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);

    const res = await POST(new Request("http://localhost"), makeCtx(bob.id));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.blockerId).toBe(alice.id);
    expect(body.blockedId).toBe(bob.id);
  });

  it("returns 422 for self-block", async () => {
    const alice = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);

    const res = await POST(new Request("http://localhost"), makeCtx(alice.id));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "cannot_block_self" });
  });
});

describe("DELETE /api/users/[id]/block", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await DELETE(new Request("http://localhost"), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("unblocks and returns 204", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);

    await prisma.block.create({ data: { blockerId: alice.id, blockedId: bob.id } });

    const res = await DELETE(new Request("http://localhost"), makeCtx(bob.id));
    expect(res.status).toBe(204);

    const edge = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: alice.id, blockedId: bob.id } },
    });
    expect(edge).toBeNull();
  });
});
