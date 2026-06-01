// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser, createChallenge } from "../../../../../test/db";

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

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(activityId: string, body: unknown) {
  return new Request(`http://localhost/api/activities/${activityId}/reactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedActivity() {
  const user = await createUser({ handle: "alice" });
  const challenge = await createChallenge(user.id, {
    goalType: "BINARY",
    startDate: "2026-06-01",
    lengthDays: 50,
  });
  const activity = await prisma.activity.create({
    data: { challengeId: challenge.id, userId: user.id, dayKey: "2026-06-01", done: true },
  });
  return { user, challenge, activity };
}

describe("POST /api/activities/[id]/reactions", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(makeRequest("any", { kind: "CHEER" }), makeCtx("any"));
    expect(res.status).toBe(401);
  });

  it("creates a CHEER reaction and returns 201", async () => {
    const { activity } = await seedActivity();
    const reactor = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(reactor.id);

    const res = await POST(
      makeRequest(activity.id, { kind: "CHEER" }),
      makeCtx(activity.id),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.kind).toBe("CHEER");
    expect(body.userId).toBe(reactor.id);
    expect(body.activityId).toBe(activity.id);
  });

  it("creates a COMMENT reaction with text and returns 201", async () => {
    const { activity } = await seedActivity();
    const reactor = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(reactor.id);

    const res = await POST(
      makeRequest(activity.id, { kind: "COMMENT", text: "Keep it up!" }),
      makeCtx(activity.id),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.kind).toBe("COMMENT");
    expect(body.text).toBe("Keep it up!");
  });

  it("returns 422 for COMMENT without text", async () => {
    const { activity } = await seedActivity();
    const reactor = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(reactor.id);

    const res = await POST(
      makeRequest(activity.id, { kind: "COMMENT" }),
      makeCtx(activity.id),
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "COMMENT_REQUIRES_TEXT" });
  });

  it("returns 404 for reaction on missing activity", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await POST(
      makeRequest("nonexistent", { kind: "CHEER" }),
      makeCtx("nonexistent"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "ACTIVITY_NOT_FOUND" });
  });
});
