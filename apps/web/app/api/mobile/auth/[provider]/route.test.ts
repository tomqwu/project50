// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// Mock @/auth so importing @/lib/session (via @/lib/api/http) does not pull in
// the real NextAuth module graph, which this endpoint does not exercise.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth-callbacks", () => ({ resolveOAuthUser: vi.fn(), resolveE2eUser: vi.fn() }));
vi.mock("@/lib/mobile-session", () => ({ mintSessionToken: vi.fn(), readBearerUser: vi.fn() }));
vi.mock("@/lib/auth-config", () => ({ shouldRegisterE2eProvider: vi.fn() }));
import { resolveOAuthUser, resolveE2eUser } from "@/lib/auth-callbacks";
import { mintSessionToken } from "@/lib/mobile-session";
import { shouldRegisterE2eProvider } from "@/lib/auth-config";
import { LOCKOUT_CONFIG, resetLockout } from "@/lib/lockout";
import { resetRateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  vi.restoreAllMocks();
  resetLockout();
  resetRateLimit();
  process.env.FACEBOOK_CLIENT_ID = "appid";
  process.env.FACEBOOK_CLIENT_SECRET = "secret";
});

function req(body: unknown, ip?: string) {
  return new Request("http://test/api/mobile/auth/facebook", {
    method: "POST",
    body: JSON.stringify(body),
    ...(ip ? { headers: { "x-forwarded-for": ip } } : {}),
  });
}

/** Queue a single failing FB token-exchange response. */
function mockFailedExchange() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: { message: "bad code" } }), {
      status: 400,
    }),
  );
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

describe("account lockout (#34)", () => {
  const ip = "203.0.113.7";

  it("locks the IP with a 429 + Retry-After after maxFailures failed exchanges", async () => {
    mockFailedExchange();

    // The first `maxFailures` attempts fail with 422 (provider verification).
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures; i++) {
      const res = await POST(
        req({ code: "bad", redirectUri: "r" }, ip),
        ctx("facebook"),
      );
      expect(res.status).toBe(422);
    }

    // The next attempt is rejected up front by the lockout — no fetch is made.
    const fetchCalls = vi.mocked(globalThis.fetch).mock.calls.length;
    const locked = await POST(
      req({ code: "bad", redirectUri: "r" }, ip),
      ctx("facebook"),
    );
    expect(locked.status).toBe(429);
    expect(locked.headers.get("Retry-After")).toBe(
      String(Math.ceil(LOCKOUT_CONFIG.lockoutMs / 1000)),
    );
    expect(await locked.json()).toEqual({
      error: "locked_out",
      detail: { retryAfterSeconds: Math.ceil(LOCKOUT_CONFIG.lockoutMs / 1000) },
    });
    // No additional fetch was issued for the locked-out request.
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(fetchCalls);
  });

  it("does not lock a different IP", async () => {
    mockFailedExchange();
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures; i++) {
      await POST(req({ code: "bad", redirectUri: "r" }, ip), ctx("facebook"));
    }
    // A different IP is unaffected and still reaches provider verification (422).
    const other = await POST(
      req({ code: "bad", redirectUri: "r" }, "198.51.100.2"),
      ctx("facebook"),
    );
    expect(other.status).toBe(422);
  });

  it("clears failures on a successful exchange so the IP is not locked", async () => {
    // First, a few (under-threshold) failures.
    mockFailedExchange();
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures - 1; i++) {
      await POST(req({ code: "bad", redirectUri: "r" }, ip), ctx("facebook"));
    }

    // Then a successful exchange clears the counter.
    vi.spyOn(globalThis, "fetch")
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
    const ok = await POST(
      req({ code: "good", redirectUri: "r" }, ip),
      ctx("facebook"),
    );
    expect(ok.status).toBe(200);

    // After the success, the failure counter is reset: maxFailures-1 more
    // failures still do not lock the IP.
    mockFailedExchange();
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures - 1; i++) {
      const res = await POST(
        req({ code: "bad", redirectUri: "r" }, ip),
        ctx("facebook"),
      );
      expect(res.status).toBe(422);
    }
  });
});

describe("POST /api/mobile/auth/e2e (gated dev sign-in)", () => {
  it("mints a Bearer token for the handle when the e2e path is armed", async () => {
    vi.mocked(shouldRegisterE2eProvider).mockReturnValue(true);
    vi.mocked(resolveE2eUser).mockResolvedValue({ id: "uid-e2e", displayName: "alice" });
    vi.mocked(mintSessionToken).mockResolvedValue("e2e-jwt");

    const res = await POST(req({ handle: "alice" }), ctx("e2e"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "e2e-jwt" });
    expect(resolveE2eUser).toHaveBeenCalledWith("alice");
    expect(mintSessionToken).toHaveBeenCalledWith("uid-e2e");
  });

  it("defaults the handle to 'dev' when none is provided", async () => {
    vi.mocked(shouldRegisterE2eProvider).mockReturnValue(true);
    vi.mocked(resolveE2eUser).mockResolvedValue({ id: "uid-dev", displayName: "dev" });
    vi.mocked(mintSessionToken).mockResolvedValue("dev-jwt");

    const res = await POST(req({}), ctx("e2e"));

    expect(res.status).toBe(200);
    expect(resolveE2eUser).toHaveBeenCalledWith("dev");
  });

  it("refuses with 422 when the e2e path is not armed (e.g. production)", async () => {
    vi.mocked(shouldRegisterE2eProvider).mockReturnValue(false);

    const res = await POST(req({ handle: "x" }), ctx("e2e"));

    expect(res.status).toBe(422);
    expect(resolveE2eUser).not.toHaveBeenCalled();
  });
});
