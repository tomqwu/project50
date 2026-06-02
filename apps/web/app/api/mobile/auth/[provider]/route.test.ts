// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// Mock @/auth so importing @/lib/session (via @/lib/api/http) does not pull in
// the real NextAuth module graph, which this endpoint does not exercise.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth-callbacks", () => ({ resolveOAuthUser: vi.fn() }));
vi.mock("@/lib/mobile-session", () => ({ mintSessionToken: vi.fn(), readBearerUser: vi.fn() }));
import { resolveOAuthUser } from "@/lib/auth-callbacks";
import { mintSessionToken } from "@/lib/mobile-session";

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.FACEBOOK_CLIENT_ID = "appid";
  process.env.FACEBOOK_CLIENT_SECRET = "secret";
});

function req(body: unknown) {
  return new Request("http://test/api/mobile/auth/facebook", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) });

describe("POST /api/mobile/auth/[provider]", () => {
  it("exchanges code, resolves user, returns minted token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fb-at" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "fb-1", name: "Al", email: "a@x.com" }), {
          status: 200,
        }),
      );
    vi.mocked(resolveOAuthUser).mockResolvedValue("uid-9");
    vi.mocked(mintSessionToken).mockResolvedValue("minted-jwt");

    const res = await POST(req({ code: "c", redirectUri: "project50://redirect" }), ctx("facebook"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "minted-jwt" });
    expect(resolveOAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "FACEBOOK",
        providerAccountId: "fb-1",
        email: "a@x.com",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an unsupported provider with 422", async () => {
    const res = await POST(req({ code: "c", redirectUri: "r" }), ctx("twitter"));
    expect(res.status).toBe(422);
  });

  it("returns 422 when the FB token exchange fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "bad code" } }), { status: 400 }),
    );
    const res = await POST(req({ code: "bad", redirectUri: "r" }), ctx("facebook"));
    expect(res.status).toBe(422);
  });
});
