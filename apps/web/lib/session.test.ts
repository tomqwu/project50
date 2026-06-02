import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("./mobile-session", () => ({ readBearerUser: vi.fn() }));

import { auth } from "@/auth";
import { headers } from "next/headers";
import { readBearerUser } from "./mobile-session";
import { requireUser, UnauthorizedError } from "./session";

beforeEach(() => {
  // Safe defaults: no Bearer token present unless a test opts in.
  vi.mocked(headers).mockResolvedValue({ get: () => null } as never);
  vi.mocked(readBearerUser).mockResolvedValue(null);
});

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

describe("requireUser — Bearer fallback", () => {
  it("returns uid from Bearer token when there is no cookie session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(headers).mockResolvedValue({ get: () => "Bearer tok" } as never);
    vi.mocked(readBearerUser).mockResolvedValue("u-bearer");
    await expect(requireUser()).resolves.toBe("u-bearer");
  });

  it("throws when neither cookie nor Bearer yields a user", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(headers).mockResolvedValue({ get: () => null } as never);
    vi.mocked(readBearerUser).mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
