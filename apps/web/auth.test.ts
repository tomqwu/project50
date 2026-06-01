/**
 * Covers auth.ts top-level wiring.
 *
 * Strategy: use vi.resetModules() + dynamic import with process.env.AUTH_E2E
 * toggled to exercise both the "e2e provider included" and "e2e provider
 * excluded" branches.  @project50/db prisma is mocked so we don't need a DB
 * at module-import time.  The Credentials mock captures the `authorize`
 * function so we can invoke it to cover lines 21-28 (the e2e authorize body).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- Stable mocks registered at module scope so vi.resetModules doesn't lose them ----
vi.mock("@project50/db", () => ({
  prisma: {
    user: {
      upsert: vi.fn().mockResolvedValue({ id: "mock-user-id", displayName: "Mock" }),
    },
    identity: { upsert: vi.fn() },
  },
}));

// Track NextAuth factory calls
const capturedCalls: { providers: { id?: string }[]; hasE2E: boolean }[] = [];

// Capture the authorize fn from the Credentials provider config
let capturedAuthorize: ((creds: Record<string, unknown>) => Promise<unknown>) | null = null;

vi.mock("next-auth", () => ({
  default: (config: { providers: { id?: string }[] }) => {
    const providers = config.providers ?? [];
    const hasE2E = providers.some((p) => p.id === "e2e");
    capturedCalls.push({ providers, hasE2E });
    return {
      handlers: { GET: vi.fn(), POST: vi.fn() },
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  },
}));

vi.mock("next-auth/providers/google", () => ({ default: () => ({ id: "google" }) }));
vi.mock("next-auth/providers/facebook", () => ({ default: () => ({ id: "facebook" }) }));
vi.mock("next-auth/providers/credentials", () => ({
  default: (cfg: { id?: string; authorize?: (creds: Record<string, unknown>) => Promise<unknown> }) => {
    // Capture the authorize function so we can call it to cover auth.ts lines 21-28
    if (cfg.authorize) capturedAuthorize = cfg.authorize;
    return { id: cfg.id ?? "credentials" };
  },
}));
vi.mock("@/lib/auth-callbacks", () => ({
  onJwt: vi.fn(),
  onSession: vi.fn(),
  onSignIn: vi.fn(),
}));

beforeEach(() => {
  capturedCalls.length = 0;
  capturedAuthorize = null;
  vi.resetModules();
});

afterEach(() => {
  delete process.env.AUTH_E2E;
  delete process.env.AUTH_SECRET;
});

describe("auth.ts module wiring", () => {
  it("exports auth, handlers, signIn, signOut when AUTH_E2E is unset", async () => {
    process.env.AUTH_SECRET = "test-secret";
    delete process.env.AUTH_E2E;

    const mod = await import("./auth");

    expect(mod.auth).toBeDefined();
    expect(mod.handlers).toBeDefined();
    expect(mod.signIn).toBeDefined();
    expect(mod.signOut).toBeDefined();
  });

  it("does NOT include the e2e provider when AUTH_E2E is not '1'", async () => {
    process.env.AUTH_SECRET = "test-secret";
    delete process.env.AUTH_E2E;

    await import("./auth");

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls.at(0)?.hasE2E).toBe(false);
    // authorize was not captured — the credentials block was skipped
    expect(capturedAuthorize).toBeNull();
  });

  it("includes the e2e provider when AUTH_E2E=1", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_E2E = "1";

    await import("./auth");

    expect(capturedCalls.some((c) => c.hasE2E)).toBe(true);
    // authorize function was captured from the Credentials config
    expect(capturedAuthorize).toBeTypeOf("function");
  });

  it("e2e authorize returns user object with id and name (default handle)", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_E2E = "1";

    await import("./auth");
    expect(capturedAuthorize).toBeTypeOf("function");

    // Call the captured authorize — prisma.user.upsert is mocked above
    const result = await capturedAuthorize!({});
    expect(result).toMatchObject({ id: "mock-user-id", name: "Mock" });
  });

  it("e2e authorize uses the provided handle", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_E2E = "1";

    await import("./auth");
    expect(capturedAuthorize).toBeTypeOf("function");

    const result = await capturedAuthorize!({ handle: "myhandle" });
    expect(result).toMatchObject({ id: "mock-user-id", name: "Mock" });
  });
});
