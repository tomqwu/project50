import { describe, expect, it, vi, beforeEach } from "vitest";

// ---- hoisted mocks ----
const { mockRequireUser, mockRedirect } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockRedirect: vi.fn<(url: string) => never>(),
}));

vi.mock("./session", () => ({ requireUser: mockRequireUser }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

import { requireAuth } from "./auth-guard";

describe("requireAuth", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns uid when user is authenticated", async () => {
    mockRequireUser.mockResolvedValue("u1");
    const uid = await requireAuth();
    expect(uid).toBe("u1");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("calls redirect('/signin') when requireUser throws", async () => {
    mockRequireUser.mockRejectedValue(new Error("unauth"));
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/signin");
  });
});
