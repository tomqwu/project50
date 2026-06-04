// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequestMagicLink } = vi.hoisted(() => ({
  mockRequestMagicLink: vi.fn(),
}));
vi.mock("@/lib/api/magic-link", () => ({ requestMagicLink: mockRequestMagicLink }));
// http.ts → session.ts → @/auth pulls in next-auth at import time; stub session
// (unused by this route) to keep the import chain DB/next-auth-free, mirroring
// the referral route tests.
vi.mock("@/lib/session", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
});

function req(body: unknown, raw = false) {
  return new Request("http://localhost/api/auth/magic-link/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe("POST /api/auth/magic-link/request", () => {
  it("returns { sent: true } and calls requestMagicLink with the trimmed email", async () => {
    mockRequestMagicLink.mockResolvedValue({ sent: true });
    const res = await POST(req({ email: "  alice@example.com  " }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: true });
    expect(mockRequestMagicLink).toHaveBeenCalledWith("alice@example.com");
  });

  it("returns { sent: false } when email is not configured (no-op)", async () => {
    mockRequestMagicLink.mockResolvedValue({ sent: false, reason: "not_configured" });
    const res = await POST(req({ email: "alice@example.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: false });
  });

  it("returns 422 when requestMagicLink reports an invalid email", async () => {
    mockRequestMagicLink.mockResolvedValue({ sent: false, reason: "invalid_email" });
    const res = await POST(req({ email: "bad@" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "INVALID_EMAIL" });
  });

  it("returns 422 for a missing or non-string email (does not call the lib)", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "INVALID_EMAIL" });
    expect(mockRequestMagicLink).not.toHaveBeenCalled();
  });

  it("returns 422 for a blank email", async () => {
    const res = await POST(req({ email: "   " }));
    expect(res.status).toBe(422);
    expect(mockRequestMagicLink).not.toHaveBeenCalled();
  });

  it("returns 422 when the body is not valid JSON", async () => {
    const res = await POST(req("not json{", true));
    expect(res.status).toBe(422);
    expect(mockRequestMagicLink).not.toHaveBeenCalled();
  });
});
