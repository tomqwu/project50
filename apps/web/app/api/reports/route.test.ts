// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../test/db";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { POST } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeReq(body: unknown) {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/reports", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(makeReq({ targetType: "USER", targetId: "x", reason: "spam" }));
    expect(res.status).toBe(401);
  });

  it("creates a report and returns 201", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);

    const res = await POST(
      makeReq({ targetType: "USER", targetId: bob.id, reason: "spam" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.reporterId).toBe(alice.id);
    expect(body.targetType).toBe("USER");
    expect(body.targetId).toBe(bob.id);
    expect(body.reason).toBe("spam");
  });

  it("returns 422 for an invalid targetType", async () => {
    const alice = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);

    const res = await POST(
      makeReq({ targetType: "COMMENT", targetId: "x", reason: "spam" }),
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_target_type" });
  });

  it("returns 422 for an empty reason", async () => {
    const alice = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(alice.id);

    const res = await POST(
      makeReq({ targetType: "USER", targetId: "x", reason: "  " }),
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "reason_required" });
  });
});
