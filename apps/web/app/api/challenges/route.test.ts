// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../test/db";

// Mock session so we can control auth
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { POST, GET } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/challenges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/challenges", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("creates a challenge and returns 201", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await POST(
      makeRequest({
        title: "My Challenge",
        goalType: "BINARY",
        startDate: "2026-06-01",
        lengthDays: 50,
        timezone: "UTC",
        visibility: "PUBLIC",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("My Challenge");
    expect(body.ownerId).toBe(user.id);
  });

  it("returns 422 for invalid challenge input", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    const res = await POST(
      makeRequest({
        title: "",
        goalType: "TARGET",
        startDate: "2026-06-01",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("INVALID_CHALLENGE");
  });
});

describe("GET /api/challenges", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns owner's challenges", async () => {
    const user = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(user.id);

    // First create a challenge via POST
    await POST(
      makeRequest({
        title: "Running",
        goalType: "BINARY",
        startDate: "2026-06-01",
      }),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Running");
  });
});
