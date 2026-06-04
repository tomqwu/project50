// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { prisma, resetDb, createUser } from "../../test/db";
import {
  requestMagicLink,
  verifyMagicLink,
  MAGIC_LINK_TTL_MS,
} from "./magic-link";

const ENV = { ...process.env };

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.AUTH_URL;
  delete process.env.NEXTAUTH_URL;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ENV };
});

afterAll(async () => {
  await prisma.$disconnect();
});

type FetchSpy = ReturnType<typeof vi.fn>;

/** Enable email config + stub a successful Resend POST. Returns the fetch spy. */
function enableEmail(): FetchSpy {
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "noreply@p50.co";
  const spy: FetchSpy = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Extract the raw token from the link in the sent email body. */
function tokenFromFetch(spy: FetchSpy): string {
  const init = spy.mock.calls[0]![1] as RequestInit;
  const body = JSON.parse(init.body as string) as { text: string };
  const match = body.text.match(/token=([0-9a-f]+)/);
  if (!match) throw new Error("no token in email body");
  return match[1]!;
}

describe("requestMagicLink", () => {
  it("is a no-op returning not_configured when email is unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await requestMagicLink("alice@example.com");
    expect(res).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await prisma.magicLinkToken.count()).toBe(0);
  });

  it("creates a hashed token and sends an email when configured", async () => {
    const fetchSpy = enableEmail();
    const res = await requestMagicLink("Alice@Example.com");
    expect(res).toEqual({ sent: true });

    const tokens = await prisma.magicLinkToken.findMany();
    expect(tokens).toHaveLength(1);
    // Email is normalized (trim + lowercase).
    expect(tokens[0]!.email).toBe("alice@example.com");
    expect(tokens[0]!.usedAt).toBeNull();

    // The raw token is NOT stored; only its sha256 hash.
    const rawToken = tokenFromFetch(fetchSpy);
    expect(tokens[0]!.tokenHash).toBe(
      createHash("sha256").update(rawToken).digest("hex"),
    );
    expect(tokens[0]!.tokenHash).not.toBe(rawToken);

    // TTL is ~15 minutes in the future.
    const ttl = tokens[0]!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(MAGIC_LINK_TTL_MS - 5000);
    expect(ttl).toBeLessThanOrEqual(MAGIC_LINK_TTL_MS);

    // The email was sent to the normalized address.
    const sentBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(sentBody.to).toBe("alice@example.com");
  });

  it("uses AUTH_URL as the link base when set", async () => {
    process.env.AUTH_URL = "https://app.example.com/";
    const fetchSpy = enableEmail();
    await requestMagicLink("bob@example.com");
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.text).toContain("https://app.example.com/auth/magic?token=");
    expect(body.html).toContain("https://app.example.com/auth/magic?token=");
  });

  it("rejects an obviously-invalid email without creating a token", async () => {
    const fetchSpy = enableEmail();
    const res = await requestMagicLink("not-an-email");
    expect(res).toEqual({ sent: false, reason: "invalid_email" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await prisma.magicLinkToken.count()).toBe(0);
  });
});

describe("verifyMagicLink", () => {
  it("returns null for an empty token", async () => {
    expect(await verifyMagicLink("")).toBeNull();
  });

  it("returns null for an unknown token", async () => {
    expect(await verifyMagicLink("deadbeef")).toBeNull();
  });

  it("signs in (creates a user) on a valid token and marks it used", async () => {
    const fetchSpy = enableEmail();
    await requestMagicLink("carol@example.com");
    const token = tokenFromFetch(fetchSpy);

    const uid = await verifyMagicLink(token);
    expect(uid).toBeTypeOf("string");

    const user = await prisma.user.findUnique({ where: { id: uid! } });
    expect(user?.email).toBe("carol@example.com");
    expect(user?.handle).toBe("carol");

    // Token is now consumed.
    const record = await prisma.magicLinkToken.findFirst();
    expect(record?.usedAt).not.toBeNull();
  });

  it("reuses an existing user with the same email", async () => {
    const fetchSpy = enableEmail();
    const existing = await prisma.user.create({
      data: { handle: "dave", displayName: "Dave", email: "dave@example.com" },
    });

    await requestMagicLink("dave@example.com");
    const token = tokenFromFetch(fetchSpy);
    const uid = await verifyMagicLink(token);

    expect(uid).toBe(existing.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it("appends a numeric suffix when the derived handle collides", async () => {
    const fetchSpy = enableEmail();
    // A user already owns the handle "erin" (but a different/no email).
    await createUser({ handle: "erin" });

    await requestMagicLink("erin@example.com");
    const token = tokenFromFetch(fetchSpy);
    const uid = await verifyMagicLink(token);

    const user = await prisma.user.findUnique({ where: { id: uid! } });
    expect(user?.handle).toBe("erin2");
    expect(user?.email).toBe("erin@example.com");
  });

  it("returns null for an already-used token (no second sign-in)", async () => {
    const fetchSpy = enableEmail();
    await requestMagicLink("frank@example.com");
    const token = tokenFromFetch(fetchSpy);

    const first = await verifyMagicLink(token);
    expect(first).toBeTypeOf("string");

    const second = await verifyMagicLink(token);
    expect(second).toBeNull();
    expect(await prisma.user.count()).toBe(1);
  });

  it("falls back to the 'user' handle base when the stored email has an empty local-part", async () => {
    // requestMagicLink validates the address, so this degenerate email can only
    // arrive via a directly-inserted token; verify the defensive fallback in
    // upsertUserByEmail still yields a usable handle.
    const raw = "deadbeefdeadbeef";
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await prisma.magicLinkToken.create({
      data: {
        email: "@nodomain.com",
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const uid = await verifyMagicLink(raw);
    const user = await prisma.user.findUnique({ where: { id: uid! } });
    // "@nodomain.com".split("@")[0] === "" → falls back to "user", then the
    // non-alnum replace leaves it untouched.
    expect(user?.handle).toBe("user");
  });

  it("returns null for an expired token", async () => {
    const fetchSpy = enableEmail();
    await requestMagicLink("grace@example.com");
    const token = tokenFromFetch(fetchSpy);

    // Force the token into the past.
    await prisma.magicLinkToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await verifyMagicLink(token)).toBeNull();
    expect(await prisma.user.count()).toBe(0);
  });

  it("returns null if the token is consumed by a concurrent request (race)", async () => {
    const fetchSpy = enableEmail();
    await requestMagicLink("heidi@example.com");
    const token = tokenFromFetch(fetchSpy);

    // Simulate a racing request having stamped usedAt between the read and the
    // conditional update: a concurrent request already consumed it, so the
    // guarded updateMany matches 0 rows → verifyMagicLink returns null and does
    // NOT create a user.
    const spy = vi
      .spyOn(prisma.magicLinkToken, "updateMany")
      .mockResolvedValueOnce({ count: 0 });

    expect(await verifyMagicLink(token)).toBeNull();
    expect(await prisma.user.count()).toBe(0);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
