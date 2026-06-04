// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../../test/db";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { GET, PATCH } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/notifications/preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/notifications/preferences", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("nope"));
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns the user's current preferences", async () => {
    const u = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(u.id);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      remindersEnabled: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    });
  });
});

describe("PATCH /api/notifications/preferences", () => {
  it("updates the provided fields and returns the result", async () => {
    const u = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(u.id);
    const res = await PATCH(
      patchReq({ remindersEnabled: false, quietHoursStart: 22, quietHoursEnd: 7 }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      remindersEnabled: false,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    });
  });

  it("ignores unknown fields and only applies known ones", async () => {
    const u = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(u.id);
    const res = await PATCH(
      patchReq({ remindersEnabled: false, bogus: "x" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ remindersEnabled: false });
  });

  it("returns 422 for an invalid hour", async () => {
    const u = await createUser({ handle: "alice" });
    vi.mocked(requireUser).mockResolvedValue(u.id);
    const res = await PATCH(patchReq({ quietHoursStart: 99 }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "invalid_quiet_hours" });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("nope"));
    const res = await PATCH(patchReq({ remindersEnabled: false }));
    expect(res.status).toBe(401);
  });
});
