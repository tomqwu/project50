/**
 * Unit tests for apiClient.ts — all methods tested with global.fetch mocked.
 * Covers: success shape, body/headers/url correctness, error mapping (401/404/422 → ApiError).
 */

import { ApiClient, ApiError } from "./apiClient";

// ─── Helpers ────────────────────────────────────────────────────────────────

const gFetch = (): jest.Mock => global.fetch as jest.Mock;

function mockFetchOk(body: unknown, status = 200): void {
  gFetch().mockResolvedValueOnce({
    ok: true,
    status,
    json: () => Promise.resolve(body),
  });
}

function mockFetchError(status: number, code: string): void {
  gFetch().mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ code }),
  });
}

function mockFetchErrorBadJson(status: number): void {
  gFetch().mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.reject(new Error("bad json")),
  });
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = jest.fn() as typeof fetch;
});

afterEach(() => {
  jest.resetAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function lastCall(): [string, RequestInit] {
  return gFetch().mock.calls[0] as [string, RequestInit];
}

// ─── Constructor / auth ─────────────────────────────────────────────────────

describe("ApiClient constructor + auth", () => {
  it("uses the resolved default base URL when none provided (dev → localhost)", async () => {
    // Under jest-expo, __DEV__ is true, so the default resolves to localhost.
    const client = new ApiClient();
    mockFetchOk([]);
    await client.listChallenges();
    const [url] = lastCall();
    expect(url).toContain("http://localhost:3000");
  });

  it("defaults to the prod domain in a production (non-dev) build", async () => {
    const realDev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      const client = new ApiClient();
      mockFetchOk([]);
      await client.listChallenges();
      const [url] = lastCall();
      expect(url).toBe("https://www.project50.fit/api/challenges");
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = realDev;
    }
  });

  // The EXPO_PUBLIC_API_BASE_URL override precedence + normalisation is unit-
  // tested in config.test.ts against the pure resolveApiBaseUrlFrom() helper
  // (Expo inlines EXPO_PUBLIC_* at build time, so it can't be mutated at runtime
  // under jest-expo). Here we cover that an explicit constructor baseUrl wins.

  it("uses custom base URL", async () => {
    const client = new ApiClient("https://api.example.com");
    mockFetchOk([]);
    await client.listChallenges();
    const [url] = lastCall();
    expect(url).toContain("https://api.example.com");
  });

  it("includes Authorization header when token is set", async () => {
    const client = new ApiClient("http://localhost:3000");
    client.setToken("tok-abc");
    mockFetchOk([]);
    await client.listChallenges();
    const [, init] = lastCall();
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok-abc");
  });

  it("omits Authorization header when no token", async () => {
    const client = new ApiClient("http://localhost:3000");
    mockFetchOk([]);
    await client.listChallenges();
    const [, init] = lastCall();
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("getToken returns null initially", () => {
    const client = new ApiClient();
    expect(client.getToken()).toBeNull();
  });

  it("getToken returns token after setToken", () => {
    const client = new ApiClient();
    client.setToken("abc");
    expect(client.getToken()).toBe("abc");
  });

  it("setToken(null) clears token", () => {
    const client = new ApiClient();
    client.setToken("abc");
    client.setToken(null);
    expect(client.getToken()).toBeNull();
  });
});

// ─── Error mapping ───────────────────────────────────────────────────────────

describe("error mapping", () => {
  const client = new ApiClient("http://localhost:3000");

  it("maps 401 to ApiError with code from body", async () => {
    mockFetchError(401, "UNAUTHORIZED");
    await expect(client.listChallenges()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("maps 404 to ApiError", async () => {
    mockFetchError(404, "CHALLENGE_NOT_FOUND");
    await expect(client.getChallenge("x")).rejects.toMatchObject({
      status: 404,
      code: "CHALLENGE_NOT_FOUND",
    });
  });

  it("maps 422 to ApiError", async () => {
    mockFetchError(422, "INVALID_ACTIVITY");
    await expect(
      client.logActivity("c1", { dayKey: "2026-01-01" }),
    ).rejects.toMatchObject({
      status: 422,
      code: "INVALID_ACTIVITY",
    });
  });

  it("falls back to UNKNOWN_ERROR when JSON parse fails", async () => {
    mockFetchErrorBadJson(500);
    await expect(client.listChallenges()).rejects.toMatchObject({
      status: 500,
      code: "UNKNOWN_ERROR",
    });
  });

  it("falls back to UNKNOWN_ERROR when JSON has no code field", async () => {
    gFetch().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: "server error" }), // no `code` field
    });
    await expect(client.listChallenges()).rejects.toMatchObject({
      status: 500,
      code: "UNKNOWN_ERROR",
    });
  });

  it("ApiError is instanceof Error", async () => {
    mockFetchError(401, "UNAUTHORIZED");
    const err = await client.listChallenges().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe("ApiError");
  });

  it("ApiError message contains status and code", async () => {
    mockFetchError(404, "NOT_FOUND");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const err: unknown = await client.listChallenges().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain("404");
    expect((err as ApiError).message).toContain("NOT_FOUND");
  });
});

// ─── listChallenges ──────────────────────────────────────────────────────────

describe("listChallenges", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls GET /api/challenges", async () => {
    mockFetchOk([]);
    await client.listChallenges();
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/challenges");
    expect(init.method).toBe("GET");
  });

  it("returns array of challenges", async () => {
    const data = [{ id: "c1", title: "Run 5K" }];
    mockFetchOk(data);
    const result = await client.listChallenges();
    expect(result).toEqual(data);
  });
});

// ─── getChallenge ────────────────────────────────────────────────────────────

describe("getChallenge", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls GET /api/challenges/:id", async () => {
    mockFetchOk({ id: "c1" });
    await client.getChallenge("c1");
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/challenges/c1");
    expect(init.method).toBe("GET");
  });

  it("returns challenge detail", async () => {
    const data = { id: "c1", title: "Run 5K", activities: [], dayStatuses: [] };
    mockFetchOk(data);
    const result = await client.getChallenge("c1");
    expect(result).toEqual(data);
  });
});

// ─── createChallenge ─────────────────────────────────────────────────────────

describe("createChallenge", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls POST /api/challenges with body", async () => {
    mockFetchOk({ id: "c1" }, 201);
    const input = {
      title: "Run 5K",
      goalType: "TARGET" as const,
      dailyTarget: 5,
      unit: "km",
      startDate: "2026-01-01",
    };
    await client.createChallenge(input);
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/challenges");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("returns created challenge", async () => {
    const data = { id: "c2", title: "Meditate" };
    mockFetchOk(data, 201);
    const result = await client.createChallenge({
      title: "Meditate",
      goalType: "BINARY",
      startDate: "2026-01-01",
    });
    expect(result).toEqual(data);
  });

  it("throws ApiError on 422", async () => {
    mockFetchError(422, "INVALID_CHALLENGE");
    await expect(
      client.createChallenge({ title: "", goalType: "BINARY", startDate: "2026-01-01" }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CHALLENGE" });
  });
});

// ─── updateChallenge ─────────────────────────────────────────────────────────

describe("updateChallenge", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls PATCH /api/challenges/:id with body", async () => {
    mockFetchOk({ id: "c1", title: "Run 10K" });
    const input = { title: "Run 10K", dailyTarget: 10, unit: "km", visibility: "PRIVATE" as const };
    await client.updateChallenge("c1", input);
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/challenges/c1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("returns updated challenge", async () => {
    const data = { id: "c1", title: "Run 10K" };
    mockFetchOk(data);
    const result = await client.updateChallenge("c1", { title: "Run 10K" });
    expect(result).toEqual(data);
  });

  it("throws ApiError on 404", async () => {
    mockFetchError(404, "CHALLENGE_NOT_FOUND");
    await expect(
      client.updateChallenge("nope", { title: "x" }),
    ).rejects.toMatchObject({ status: 404, code: "CHALLENGE_NOT_FOUND" });
  });
});

// ─── deleteChallenge ─────────────────────────────────────────────────────────

describe("deleteChallenge", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls DELETE /api/challenges/:id", async () => {
    mockFetchOk({ ok: true });
    await client.deleteChallenge("c1");
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/challenges/c1");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("returns ok result", async () => {
    mockFetchOk({ ok: true });
    const result = await client.deleteChallenge("c1");
    expect(result).toEqual({ ok: true });
  });

  it("throws ApiError on 404", async () => {
    mockFetchError(404, "CHALLENGE_NOT_FOUND");
    await expect(client.deleteChallenge("nope")).rejects.toMatchObject({
      status: 404,
      code: "CHALLENGE_NOT_FOUND",
    });
  });
});

// ─── logActivity ─────────────────────────────────────────────────────────────

describe("logActivity", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls POST /api/challenges/:id/activities with body", async () => {
    mockFetchOk({ activity: {}, dayStatus: {}, newMilestones: [] });
    const input = { dayKey: "2026-01-01", amount: 5 };
    await client.logActivity("c1", input);
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/challenges/c1/activities");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("includes media in body when provided", async () => {
    mockFetchOk({ activity: {}, dayStatus: {}, newMilestones: [] });
    const input = {
      dayKey: "2026-01-01",
      done: true,
      media: [{ objectKey: "media/u/img.jpg", width: 1080, height: 720 }],
    };
    await client.logActivity("c1", input);
    const [, init] = lastCall();
    const body = JSON.parse(init.body as string) as typeof input;
    expect(body.media).toEqual(input.media);
  });

  it("returns log result", async () => {
    const data = { activity: { id: "a1" }, dayStatus: { dayKey: "2026-01-01", completed: true }, newMilestones: [] };
    mockFetchOk(data);
    const result = await client.logActivity("c1", { dayKey: "2026-01-01", amount: 5 });
    expect(result).toEqual(data);
  });
});

// ─── getFeed ─────────────────────────────────────────────────────────────────

describe("getFeed", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls GET /api/feed with no query when no opts given", async () => {
    mockFetchOk({ items: [], nextCursor: null });
    await client.getFeed();
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/feed");
    expect(init.method).toBe("GET");
  });

  it("returns the { items, nextCursor } page", async () => {
    const data = { items: [{ id: "a1", cheerCount: 2 }], nextCursor: "a1" };
    mockFetchOk(data);
    const result = await client.getFeed();
    expect(result).toEqual(data);
  });

  it("passes cursor and limit as query params", async () => {
    mockFetchOk({ items: [], nextCursor: null });
    await client.getFeed({ cursor: "a9", limit: 20 });
    const [url] = lastCall();
    expect(url).toBe("http://localhost:3000/api/feed?cursor=a9&limit=20");
  });

  it("passes only limit when cursor is omitted", async () => {
    mockFetchOk({ items: [], nextCursor: null });
    await client.getFeed({ limit: 5 });
    const [url] = lastCall();
    expect(url).toBe("http://localhost:3000/api/feed?limit=5");
  });

  it("throws ApiError on 401", async () => {
    mockFetchError(401, "UNAUTHORIZED");
    await expect(client.getFeed()).rejects.toMatchObject({ status: 401 });
  });
});

// ─── react ────────────────────────────────────────────────────────────────────

describe("react", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls POST /api/activities/:id/reactions with CHEER kind", async () => {
    mockFetchOk({ id: "r1", kind: "CHEER" });
    await client.react("a1", "CHEER");
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/activities/a1/reactions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { kind: string; text?: string };
    expect(body.kind).toBe("CHEER");
  });

  it("sends text with COMMENT kind", async () => {
    mockFetchOk({ id: "r2", kind: "COMMENT" });
    await client.react("a1", "COMMENT", "Great job!");
    const [, init] = lastCall();
    const body = JSON.parse(init.body as string) as { kind: string; text?: string };
    expect(body.kind).toBe("COMMENT");
    expect(body.text).toBe("Great job!");
  });

  it("returns reaction object", async () => {
    const data = { id: "r3", activityId: "a1", kind: "CHEER", userId: "u1", text: null, createdAt: "2026-01-01" };
    mockFetchOk(data);
    const result = await client.react("a1", "CHEER");
    expect(result).toEqual(data);
  });

  it("throws ApiError on 422", async () => {
    mockFetchError(422, "COMMENT_REQUIRES_TEXT");
    await expect(client.react("a1", "COMMENT")).rejects.toMatchObject({
      status: 422,
      code: "COMMENT_REQUIRES_TEXT",
    });
  });
});

// ─── presignUpload ────────────────────────────────────────────────────────────

describe("presignUpload", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls POST /api/uploads/presign with body", async () => {
    mockFetchOk({ uploadUrl: "https://s3.example.com/...", objectKey: "media/u/img.jpg" });
    await client.presignUpload("image/jpeg", "jpg", "my-photo");
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/uploads/presign");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { contentType: string; ext: string; suffix: string };
    expect(body).toEqual({ contentType: "image/jpeg", ext: "jpg", suffix: "my-photo" });
  });

  it("returns uploadUrl and objectKey", async () => {
    const data = { uploadUrl: "https://s3.example.com/presigned", objectKey: "media/u/shot.jpg" };
    mockFetchOk(data);
    const result = await client.presignUpload("image/jpeg", "jpg", "shot");
    expect(result).toEqual(data);
  });

  it("throws ApiError on 422 (invalid content type)", async () => {
    mockFetchError(422, "INVALID_CONTENT_TYPE");
    await expect(
      client.presignUpload("application/pdf", "pdf", "doc"),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CONTENT_TYPE" });
  });
});

// ─── generateRecap ────────────────────────────────────────────────────────────

describe("generateRecap", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls POST /api/challenges/:id/recap with kind", async () => {
    mockFetchOk({ recapId: "r1", kind: "DAY", url: "https://cdn.example.com/r1.mp4" });
    await client.generateRecap("c1", "DAY");
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/challenges/c1/recap");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ kind: "DAY" });
  });

  it("supports WEEK and FIFTY kinds", async () => {
    mockFetchOk({ recapId: "r2", kind: "WEEK", url: "https://cdn.example.com/r2.mp4" });
    const result = await client.generateRecap("c1", "WEEK");
    expect(result.kind).toBe("WEEK");

    mockFetchOk({ recapId: "r3", kind: "FIFTY", url: "https://cdn.example.com/r3.mp4" });
    const result2 = await client.generateRecap("c1", "FIFTY");
    expect(result2.kind).toBe("FIFTY");
  });

  it("returns recap result", async () => {
    const data = { recapId: "r1", kind: "DAY" as const, url: "https://cdn.example.com/r1.mp4" };
    mockFetchOk(data);
    const result = await client.generateRecap("c1", "DAY");
    expect(result).toEqual(data);
  });
});

// ─── listRecaps ───────────────────────────────────────────────────────────────

describe("listRecaps", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls GET /api/challenges/:id/recap", async () => {
    mockFetchOk([]);
    await client.listRecaps("c1");
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/challenges/c1/recap");
    expect(init.method).toBe("GET");
  });

  it("returns list of recaps", async () => {
    const data = [{ id: "r1", kind: "DAY", url: "https://cdn.example.com/r1.mp4", createdAt: "2026-01-01" }];
    mockFetchOk(data);
    const result = await client.listRecaps("c1");
    expect(result).toEqual(data);
  });

  it("throws ApiError on 404", async () => {
    mockFetchError(404, "CHALLENGE_NOT_FOUND");
    await expect(client.listRecaps("nonexistent")).rejects.toMatchObject({
      status: 404,
      code: "CHALLENGE_NOT_FOUND",
    });
  });
});

// ─── getCapabilities ──────────────────────────────────────────────────────────

describe("getCapabilities", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls GET /api/publish/capabilities", async () => {
    mockFetchOk([]);
    await client.getCapabilities();
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/publish/capabilities");
    expect(init.method).toBe("GET");
  });

  it("returns capabilities array", async () => {
    const data = [{ kind: "INSTAGRAM", label: "Instagram", description: "Share to Instagram" }];
    mockFetchOk(data);
    const result = await client.getCapabilities();
    expect(result).toEqual(data);
  });
});

// ─── Project 50 ───────────────────────────────────────────────────────────────

describe("getProject50State", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls GET /api/project50/state", async () => {
    mockFetchOk({ status: "NONE" });
    await client.getProject50State();
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/project50/state");
    expect(init.method).toBe("GET");
  });

  it("returns the state", async () => {
    const data = { status: "NONE" as const };
    mockFetchOk(data);
    const result = await client.getProject50State();
    expect(result).toEqual(data);
  });
});

describe("startProject50", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls POST /api/project50/start with timezone body", async () => {
    mockFetchOk({ status: "ACTIVE" }, 201);
    await client.startProject50("America/New_York");
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/project50/start");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ timezone: "America/New_York" });
  });
});

describe("toggleRule", () => {
  const client = new ApiClient("http://localhost:3000");

  it("calls POST /api/project50/toggle with ruleId + done body", async () => {
    mockFetchOk({ status: "ACTIVE" });
    await client.toggleRule(3, true);
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:3000/api/project50/toggle");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ ruleId: 3, done: true });
  });
});

// ─── Content-Type header ──────────────────────────────────────────────────────

describe("Content-Type header", () => {
  const client = new ApiClient("http://localhost:3000");

  it("sets Content-Type: application/json on all requests", async () => {
    mockFetchOk([]);
    await client.listChallenges();
    const [, init] = lastCall();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});
