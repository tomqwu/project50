// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser, createChallenge } from "../../../../../test/db";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

// We also need to mock @project50/core's localDayKey so route can compute asOf
// without relying on real clock in tests (but we allow it since route uses new Date())
// The route passes asOf into the service — we just use real dates here.

import { requireUser, UnauthorizedError } from "@/lib/session";
import { POST } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/challenges/${id}/activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/challenges/[id]/activities", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(makeRequest("any", {}), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when challenge does not exist", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await POST(
      makeRequest("nonexistent", { dayKey: "2026-06-01", done: true }),
      makeCtx("nonexistent"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-owner tries to log", async () => {
    const owner = await createUser({ handle: "alice" });
    const other = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    vi.mocked(requireUser).mockResolvedValue(other.id);
    const res = await POST(
      makeRequest(challenge.id, { dayKey: "2026-06-01", done: true }),
      makeCtx(challenge.id),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
  });

  it("logs a BINARY activity and returns 201", async () => {
    const user = await createUser({ handle: "alice" });
    const challenge = await createChallenge(user.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
      timezone: "UTC",
    });

    vi.mocked(requireUser).mockResolvedValue(user.id);

    // Use today's date as dayKey so asOf (today in UTC) >= dayKey
    const today = new Date().toISOString().slice(0, 10);
    const res = await POST(
      makeRequest(challenge.id, { dayKey: today, done: true }),
      makeCtx(challenge.id),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.activity).toBeDefined();
    expect(body.dayStatus).toBeDefined();
    expect(body.newMilestones).toBeDefined();
  });

  it("returns 422 for invalid activity input", async () => {
    const user = await createUser({ handle: "alice" });
    const challenge = await createChallenge(user.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
      timezone: "UTC",
    });

    vi.mocked(requireUser).mockResolvedValue(user.id);

    // dayKey far in the future
    const res = await POST(
      makeRequest(challenge.id, { dayKey: "2030-01-01", done: true }),
      makeCtx(challenge.id),
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_ACTIVITY" });
  });
});
