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
  return new Request("http://localhost/api/project50/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/project50/start", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(makeRequest({ timezone: "UTC" }));
    expect(res.status).toBe(401);
  });

  it("returns 422 when timezone is missing", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "INVALID_TIMEZONE" });
  });

  it("returns 422 when timezone is the wrong type", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const res = await POST(makeRequest({ timezone: 42 }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when the body is not valid JSON", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);
    const req = new Request("http://localhost/api/project50/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("creates a run and returns 201 ACTIVE state", async () => {
    const user = await createUser({ handle: "bob" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await POST(makeRequest({ timezone: "UTC" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("ACTIVE");
    expect(body.today.dayNumber).toBe(1);
    expect(body.today.checks).toEqual([false, false, false, false, false, false, false]);

    const run = await prisma.challenge.findFirst({
      where: { ownerId: user.id, kind: "PROJECT50" },
    });
    expect(run?.status).toBe("ACTIVE");
  });
});
