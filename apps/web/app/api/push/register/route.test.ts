// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/push/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push/register", () => {
  it("accepts a valid token + platform and returns 200 ok", async () => {
    vi.mocked(requireUser).mockResolvedValue("uid-1");
    const res = await POST(req({ token: "ExponentPushToken[abc]", platform: "ios" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("accepts the android platform", async () => {
    vi.mocked(requireUser).mockResolvedValue("uid-2");
    const res = await POST(req({ token: "ExponentPushToken[a]", platform: "android" }));
    expect(res.status).toBe(200);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("nope"));
    const res = await POST(req({ token: "t", platform: "ios" }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns 422 for a missing token", async () => {
    vi.mocked(requireUser).mockResolvedValue("uid-3");
    const res = await POST(req({ platform: "ios" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "invalid_token" });
  });

  it("returns 422 for an empty-string token", async () => {
    vi.mocked(requireUser).mockResolvedValue("uid-3b");
    const res = await POST(req({ token: "", platform: "ios" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "invalid_token" });
  });

  it("returns 422 for a non-string token", async () => {
    vi.mocked(requireUser).mockResolvedValue("uid-4");
    const res = await POST(req({ token: 123, platform: "ios" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "invalid_token" });
  });

  it("returns 422 for an unsupported platform", async () => {
    vi.mocked(requireUser).mockResolvedValue("uid-5");
    const res = await POST(req({ token: "ExponentPushToken[x]", platform: "windows" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "invalid_platform" });
  });

  it("returns 422 for a missing platform", async () => {
    vi.mocked(requireUser).mockResolvedValue("uid-6");
    const res = await POST(req({ token: "ExponentPushToken[x]" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "invalid_platform" });
  });

  it("tolerates a non-JSON body (treats as empty → 422 invalid_token)", async () => {
    vi.mocked(requireUser).mockResolvedValue("uid-7");
    const r = new Request("http://localhost/api/push/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(r);
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "invalid_token" });
  });
});
