import { describe, it, expect, vi, beforeEach } from "vitest";

// session.ts imports @/auth (next-auth), which needs next/server — not available in vitest.
// Mock the dependency so we can test the http helpers in isolation.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { HttpError, notFound, unprocessable, handleRoute, enforceRateLimit } from "./http";
import { UnauthorizedError } from "@/lib/session";
import { resetRateLimit } from "@/lib/rate-limit";
import { renderPrometheus, resetMetrics } from "@/lib/metrics";

describe("HttpError", () => {
  it("stores status, code, and detail", () => {
    const err = new HttpError(422, "MY_CODE", { field: "value" });
    expect(err.status).toBe(422);
    expect(err.code).toBe("MY_CODE");
    expect(err.detail).toEqual({ field: "value" });
    expect(err.message).toBe("MY_CODE");
  });

  it("works without detail", () => {
    const err = new HttpError(404, "NOT_FOUND");
    expect(err.detail).toBeUndefined();
  });
});

describe("notFound", () => {
  it("throws an HttpError with status 404", () => {
    expect(() => notFound("THING_NOT_FOUND")).toThrow(HttpError);
    try {
      notFound("THING_NOT_FOUND");
    } catch (err) {
      expect((err as HttpError).status).toBe(404);
      expect((err as HttpError).code).toBe("THING_NOT_FOUND");
    }
  });
});

describe("unprocessable", () => {
  it("throws an HttpError with status 422", () => {
    expect(() => unprocessable("INVALID_INPUT")).toThrow(HttpError);
    try {
      unprocessable("INVALID_INPUT", ["err1"]);
    } catch (err) {
      expect((err as HttpError).status).toBe(422);
      expect((err as HttpError).code).toBe("INVALID_INPUT");
      expect((err as HttpError).detail).toEqual(["err1"]);
    }
  });

  it("works without detail", () => {
    try {
      unprocessable("SELF_FOLLOW");
    } catch (err) {
      expect((err as HttpError).detail).toBeUndefined();
    }
  });
});

describe("handleRoute", () => {
  it("returns the response from fn when fn succeeds", async () => {
    const res = await handleRoute(() => Promise.resolve(Response.json({ ok: true })));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("returns 401 for UnauthorizedError", async () => {
    const res = await handleRoute(async () => {
      throw new UnauthorizedError("not authed");
    });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns the HttpError status and code as JSON", async () => {
    const res = await handleRoute(async () => {
      throw new HttpError(404, "NOT_FOUND");
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "NOT_FOUND" });
  });

  it("includes detail when present on HttpError", async () => {
    const res = await handleRoute(async () => {
      throw new HttpError(422, "INVALID_INPUT", ["err"]);
    });
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error: "INVALID_INPUT",
      detail: ["err"],
    });
  });

  it("rethrows unknown errors and logs them at error level", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "error";
    const boom = new Error("unexpected");

    await expect(
      handleRoute(async () => {
        throw boom;
      }),
    ).rejects.toThrow("unexpected");

    expect(errorSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      level: "error",
      msg: "unhandled route error",
      scope: "api",
      error: { name: "Error", message: "unexpected" },
    });

    errorSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });

  it("does not log expected HttpError / UnauthorizedError at error level", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleRoute(async () => {
      throw new HttpError(404, "NOT_FOUND");
    });
    await handleRoute(async () => {
      throw new UnauthorizedError("nope");
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => resetRateLimit());

  const reqFrom = (ip: string) =>
    new Request("https://x.test", { headers: { "x-forwarded-for": ip } });

  it("does not throw while under the limit", () => {
    const opts = { limit: 2, windowMs: 60_000, now: 1_000 };
    expect(() => enforceRateLimit(reqFrom("1.1.1.1"), opts)).not.toThrow();
    expect(() => enforceRateLimit(reqFrom("1.1.1.1"), opts)).not.toThrow();
  });

  it("throws a 429 HttpError with retryAfter detail when over the limit", async () => {
    const opts = { limit: 1, windowMs: 60_000, now: 1_000 };
    enforceRateLimit(reqFrom("2.2.2.2"), opts);

    let thrown: HttpError | undefined;
    try {
      enforceRateLimit(reqFrom("2.2.2.2"), { ...opts, now: 2_000 });
    } catch (err) {
      thrown = err as HttpError;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown!.status).toBe(429);
    expect(thrown!.code).toBe("rate_limited");
    expect(thrown!.detail).toEqual({ retryAfterSeconds: 59 });

    // handleRoute serializes it to a 429 JSON response.
    const res = await handleRoute(async () => {
      enforceRateLimit(reqFrom("2.2.2.2"), { ...opts, now: 3_000 });
      return Response.json({ ok: true });
    });
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "rate_limited",
      detail: { retryAfterSeconds: 58 },
    });
  });
});

describe("handleRoute metrics instrumentation", () => {
  beforeEach(() => resetMetrics());

  it("records a request count + latency for a successful response", async () => {
    await handleRoute(() => Promise.resolve(Response.json({ ok: true })), "GET /api/feed");
    const out = renderPrometheus();
    expect(out).toContain('http_requests_total{route="GET /api/feed",status="2xx"} 1');
    expect(out).toContain('http_request_duration_ms_count{route="GET /api/feed"} 1');
  });

  it("records the mapped status for HttpError and UnauthorizedError", async () => {
    await handleRoute(async () => {
      throw new HttpError(404, "NOT_FOUND");
    }, "GET /api/thing");
    await handleRoute(async () => {
      throw new UnauthorizedError("nope");
    }, "GET /api/thing");

    const out = renderPrometheus();
    expect(out).toContain('http_requests_total{route="GET /api/thing",status="4xx"} 2');
    expect(out).toContain('http_request_duration_ms_count{route="GET /api/thing"} 2');
  });

  it("records a 5xx for a rethrown unexpected error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "error";
    await expect(
      handleRoute(async () => {
        throw new Error("boom");
      }, "POST /api/boom"),
    ).rejects.toThrow("boom");
    errorSpy.mockRestore();
    delete process.env.LOG_LEVEL;

    expect(renderPrometheus()).toContain(
      'http_requests_total{route="POST /api/boom",status="5xx"} 1',
    );
  });

  it('labels the route "unknown" when no route is passed (back-compat)', async () => {
    await handleRoute(() => Promise.resolve(Response.json({ ok: true })));
    expect(renderPrometheus()).toContain('http_requests_total{route="unknown",status="2xx"} 1');
  });
});
