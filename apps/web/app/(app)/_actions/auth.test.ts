import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }));
vi.mock("@/auth", () => ({ signOut: mockSignOut }));

import { signOutAction } from "./auth";

describe("signOutAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls signOut and redirects to /signin", async () => {
    await signOutAction();
    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/signin" });
  });
});
