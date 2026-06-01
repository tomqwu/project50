import { describe, it, expect, vi } from "vitest";

// session.ts imports @/auth (next-auth), which needs next/server — not available in vitest.
// Mock the dependency so we can test the http helpers in isolation.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { HttpError, notFound, unprocessable, handleRoute } from "./http";
import { UnauthorizedError } from "@/lib/session";

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
    const res = await handleRoute(() =>
      Promise.resolve(Response.json({ ok: true })),
    );
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

  it("rethrows unknown errors", async () => {
    const boom = new Error("unexpected");
    await expect(
      handleRoute(async () => {
        throw boom;
      }),
    ).rejects.toThrow("unexpected");
  });
});
