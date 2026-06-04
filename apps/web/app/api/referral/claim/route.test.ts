// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../../test/db";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { getOrCreateReferralCode } from "@/lib/api/referral";
import { POST } from "./route";

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function claimRequest(body: unknown, raw = false) {
  return new Request("http://localhost/api/referral/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe("POST /api/referral/claim", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(claimRequest({ code: "X" }));
    expect(res.status).toBe(401);
  });

  it("records a referral and returns { recorded: true }", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({ code }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: true });
    expect(await prisma.referral.count()).toBe(1);
  });

  it("returns { recorded: false } for an unknown code (no-op)", async () => {
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({ code: "NOPECODE" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: false });
  });

  it("trims the code before recording", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({ code: `  ${code}  ` }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: true });
  });

  it("returns 422 for a missing or non-string code", async () => {
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({}));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error: "INVALID_REFERRAL_CODE",
    });
  });

  it("returns 422 for a blank code", async () => {
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({ code: "   " }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when the body is not valid JSON", async () => {
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest("not json{", true));
    expect(res.status).toBe(422);
  });
});
