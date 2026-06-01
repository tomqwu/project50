import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { requireUser, UnauthorizedError } from "./session";

describe("requireUser", () => {
  it("returns the user id when authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    await expect(requireUser()).resolves.toBe("u1");
  });
  it("throws when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("throws when session lacks a user id", async () => {
    vi.mocked(auth).mockResolvedValue({ user: {} } as never);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
