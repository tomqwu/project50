// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../../test/db";

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

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/project50/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Create an active PROJECT50 run starting today so toggles apply to "today". */
async function startTodayRun(ownerId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await prisma.challenge.create({
    data: {
      ownerId,
      title: "Project 50",
      goalType: "BINARY",
      startDate: today,
      timezone: "UTC",
      lengthDays: 50,
      kind: "PROJECT50",
      status: "ACTIVE",
    },
  });
}

describe("POST /api/project50/toggle", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(makeRequest({ ruleId: 1, done: true }));
    expect(res.status).toBe(401);
  });

  it("returns 422 when ruleId is missing", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const res = await POST(makeRequest({ done: true }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "INVALID_TOGGLE" });
  });

  it("returns 422 when done is not a boolean", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const res = await POST(makeRequest({ ruleId: 1, done: "yes" }));
    expect(res.status).toBe(422);
  });

  it("toggles a rule and returns the updated ACTIVE state", async () => {
    const user = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    await startTodayRun(user.id);

    const res = await POST(makeRequest({ ruleId: 3, done: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ACTIVE");
    expect(body.today.checks[2]).toBe(true); // ruleId 3 → index 2
    expect(body.today.completedCount).toBe(1);
  });
});
