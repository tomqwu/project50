// @vitest-environment node
import { describe, beforeEach, it, expect, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/api/entitlements", () => ({ getEntitlement: vi.fn() }));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { getEntitlement } from "@/lib/api/entitlements";
import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/billing/entitlement", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("nope"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the signed-in user's entitlement", async () => {
    vi.mocked(requireUser).mockResolvedValue("user-1");
    vi.mocked(getEntitlement).mockResolvedValue({
      plan: "premium",
      isPremium: true,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      plan: "premium",
      isPremium: true,
    });
    expect(getEntitlement).toHaveBeenCalledWith("user-1");
  });
});
