// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../test/db";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { recordReferral, getOrCreateReferralCode } from "@/lib/api/referral";
import { GET } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/referral", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns the user's code and referral count", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "newbie" });
    await recordReferral(code, newUser.id);
    vi.mocked(requireUser).mockResolvedValue(referrer.id);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ code, referredCount: 1 });
  });
});
