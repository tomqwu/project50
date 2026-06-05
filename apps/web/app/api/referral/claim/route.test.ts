// @vitest-environment node
import { describe, beforeEach, it, expect, vi, afterAll } from "vitest";
import { prisma, resetDb, createUser } from "../../../../test/db";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

// Mock the request cookie store so the cookie-fallback path is drivable without
// a real request scope. Hoisted so the `cookies()` implementation can be
// REAPPLIED in beforeEach after vi.resetAllMocks() strips it (otherwise
// `await cookies()` returns undefined and the route throws on `.get`).
const { mockCookies, mockCookieGet } = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockCookieGet: vi.fn<(name: string) => { value: string } | undefined>(),
}));
vi.mock("next/headers", () => ({ cookies: mockCookies }));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { getOrCreateReferralCode } from "@/lib/api/referral";
import { REFERRAL_COOKIE, encodeReferralCookie } from "@/lib/referral-capture";
import { POST } from "./route";

/** Build a `<code>.<ms>` cookie value with an explicit capture time. */
function refCookie(code: string, capturedAtMs: number): { value: string } {
  return { value: encodeReferralCookie(code, capturedAtMs) };
}

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
  // Re-establish the cookie store + factory after the reset wipes them, so
  // every test (body-code AND cookie-fallback paths) gets a working `cookies()`
  // returning a store with `.get`. Defaults to "no cookie".
  mockCookieGet.mockReturnValue(undefined);
  mockCookies.mockImplementation(async () => ({ get: mockCookieGet }));
});

afterAll(async () => {
  await prisma.$disconnect();
});

function claimRequest(body: unknown, raw = false) {
  return new Request("http://localhost/api/referral/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe("POST /api/referral/claim", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("unauthed"));
    const res = await POST(claimRequest({ code: "X" }));
    expect(res.status).toBe(401);
  });

  it("records a referral and returns { recorded: true }", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({ code }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: true });
    expect(await prisma.referral.count()).toBe(1);
  });

  it("returns { recorded: false } for an unknown code (no-op)", async () => {
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({ code: "NOPECODE" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: false });
  });

  it("trims the code before recording", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({ code: `  ${code}  ` }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: true });
  });

  it("returns 422 for a missing or non-string code", async () => {
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({}));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error: "INVALID_REFERRAL_CODE",
    });
  });

  it("returns 422 for a blank code", async () => {
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest({ code: "   " }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when the body is not valid JSON", async () => {
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);

    const res = await POST(claimRequest("not json{", true));
    expect(res.status).toBe(422);
  });

  it("records a COOKIE claim when the ref was captured BEFORE signup, and clears it", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "newbie" });
    const created = (await prisma.user.findUnique({ where: { id: newUser.id } }))!.createdAt;
    vi.mocked(requireUser).mockResolvedValue(newUser.id);
    // Genuine referral: clicked the link BEFORE the account existed.
    mockCookieGet.mockReturnValue(refCookie(code, created.getTime() - 1000));

    const res = await POST(claimRequest({}));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: true });
    expect(await prisma.referral.count()).toBe(1);
    // The pending-referral cookie is cleared (max-age 0) on the response.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${REFERRAL_COOKIE}=`);
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it("records when the ref was captured exactly at signup time (capturedAt == createdAt, inclusive)", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "edge" });
    const created = (await prisma.user.findUnique({ where: { id: newUser.id } }))!.createdAt;
    vi.mocked(requireUser).mockResolvedValue(newUser.id);
    mockCookieGet.mockReturnValue(refCookie(code, created.getTime()));

    const res = await POST(claimRequest({}));
    await expect(res.json()).resolves.toEqual({ recorded: true });
    expect(await prisma.referral.count()).toBe(1);
  });

  it("prefers an explicit body code over the cookie", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);
    mockCookieGet.mockReturnValue(refCookie("STALECODE", Date.now()));

    const res = await POST(claimRequest({ code }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: true });
  });

  it("returns 422 when neither a body code nor a cookie is present", async () => {
    const newUser = await createUser({ handle: "newbie" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);
    // no cookie (default), empty body
    const res = await POST(claimRequest({}));
    expect(res.status).toBe(422);
  });

  it("clears the cookie even when the captured referral is a no-op (unknown code)", async () => {
    const newUser = await createUser({ handle: "newbie" });
    const created = (await prisma.user.findUnique({ where: { id: newUser.id } }))!.createdAt;
    vi.mocked(requireUser).mockResolvedValue(newUser.id);
    mockCookieGet.mockReturnValue(refCookie("NOPECODE", created.getTime() - 1000));

    const res = await POST(claimRequest({}));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: false });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${REFERRAL_COOKIE}=`);
  });

  it("does NOT attribute a COOKIE claim for a RETURNING (old) account, but clears the cookie", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const returning = await createUser({ handle: "returning" });
    // Account created an hour ago; the ref was captured just now (after signup).
    await prisma.user.update({
      where: { id: returning.id },
      data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    vi.mocked(requireUser).mockResolvedValue(returning.id);
    mockCookieGet.mockReturnValue(refCookie(code, Date.now()));

    const res = await POST(claimRequest({}));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: false });
    expect(await prisma.referral.count()).toBe(0);
    // The stale cookie is still cleared so it stops retrying.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${REFERRAL_COOKIE}=`);
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it("does NOT attribute when an account signs up organically then clicks the ref (capturedAt > createdAt)", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    // Brand-new account, but the ref link was captured AFTER it already existed.
    const newUser = await createUser({ handle: "organic" });
    const created = (await prisma.user.findUnique({ where: { id: newUser.id } }))!.createdAt;
    vi.mocked(requireUser).mockResolvedValue(newUser.id);
    mockCookieGet.mockReturnValue(refCookie(code, created.getTime() + 1000));

    const res = await POST(claimRequest({}));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: false });
    expect(await prisma.referral.count()).toBe(0);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${REFERRAL_COOKIE}=`);
  });

  it("does NOT attribute (and clears) when the cookie has no parseable timestamp (legacy/tampered)", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "fresh" });
    vi.mocked(requireUser).mockResolvedValue(newUser.id);
    // Legacy bare-code cookie (no `.<ms>`): fail safe → not recorded.
    mockCookieGet.mockReturnValue({ value: code });

    const res = await POST(claimRequest({}));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: false });
    expect(await prisma.referral.count()).toBe(0);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${REFERRAL_COOKIE}=`);
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it("still attributes an EXPLICIT body-code claim for an OLD account (ungated path)", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const returning = await createUser({ handle: "returning" });
    await prisma.user.update({
      where: { id: returning.id },
      data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    vi.mocked(requireUser).mockResolvedValue(returning.id);
    // No cookie — an explicit body code is intentional and NOT gated.
    const res = await POST(claimRequest({ code }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: true });
    expect(await prisma.referral.count()).toBe(1);
  });

  it("rejects a self-referral via the cookie path (no-op, cookie cleared)", async () => {
    const me = await createUser({ handle: "selfie" });
    const myCode = await getOrCreateReferralCode(me.id);
    const created = (await prisma.user.findUnique({ where: { id: me.id } }))!.createdAt;
    vi.mocked(requireUser).mockResolvedValue(me.id);
    mockCookieGet.mockReturnValue(refCookie(myCode, created.getTime() - 1000));

    const res = await POST(claimRequest({}));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recorded: false });
    expect(await prisma.referral.count()).toBe(0);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${REFERRAL_COOKIE}=`);
  });
});
