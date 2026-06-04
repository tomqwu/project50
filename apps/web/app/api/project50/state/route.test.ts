// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../../test/db";

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

describe("GET /api/project50/state", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns NONE for a user with no run", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "NONE" });
  });

  it("returns ACTIVE with today + history for an active run", async () => {
    const user = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    await prisma.challenge.create({
      data: {
        ownerId: user.id,
        title: "Project 50",
        goalType: "BINARY",
        // Far-future start so "today" is before it → dayNumber clamps to 1 and
        // no past day triggers the hard reset.
        startDate: "2999-01-01",
        timezone: "UTC",
        lengthDays: 50,
        kind: "PROJECT50",
        status: "ACTIVE",
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ACTIVE");
    expect(body.today.checks).toHaveLength(7);
    expect(body.history.days).toHaveLength(50);
  });
});
