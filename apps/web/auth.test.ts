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
const capturedCalls: {
  providers: { id?: string }[];
  hasE2E: boolean;
  config: Record<string, unknown>;
}[] = [];

// Capture the authorize fn from the Credentials provider config
let capturedAuthorize: ((creds: Record<string, unknown>) => Promise<unknown>) | null = null;
// Capture each credentials provider's authorize by its id (e2e / magic-link).
const capturedAuthorizeById: Record<
  string,
  (creds: Record<string, unknown>) => Promise<unknown>
> = {};

// Stub the email + magic-link modules so we can toggle the magic-link provider
// gate and drive its authorize without a DB.
const { mockIsEmailConfigured, mockVerifyMagicLink } = vi.hoisted(() => ({
  mockIsEmailConfigured: vi.fn((): boolean => false),
  mockVerifyMagicLink: vi.fn(
    async (...args: [string]): Promise<string | null> => {
      void args;
      return null;
    },
  ),
}));
vi.mock("@/lib/email", () => ({ isEmailConfigured: mockIsEmailConfigured }));
vi.mock("@/lib/api/magic-link", () => ({ verifyMagicLink: mockVerifyMagicLink }));

vi.mock("next-auth", () => ({
  default: (config: { providers: { id?: string }[] } & Record<string, unknown>) => {
    const providers = config.providers ?? [];
    const hasE2E = providers.some((p) => p.id === "e2e");
    capturedCalls.push({ providers, hasE2E, config });
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
    if (cfg.id && cfg.authorize) capturedAuthorizeById[cfg.id] = cfg.authorize;
    return { id: cfg.id ?? "credentials" };
  },
}));
vi.mock("@/lib/auth-callbacks", () => ({
  onJwt: vi.fn(),
  onSession: vi.fn(),
  onSignIn: vi.fn(),
  resolveE2eUser: vi.fn().mockResolvedValue({ id: "mock-user-id", displayName: "Mock" }),
}));

beforeEach(() => {
  capturedCalls.length = 0;
  capturedAuthorize = null;
  for (const k of Object.keys(capturedAuthorizeById)) delete capturedAuthorizeById[k];
  mockIsEmailConfigured.mockReset().mockReturnValue(false);
  mockVerifyMagicLink.mockReset().mockResolvedValue(null);
  // Default each OAuth provider OFF so tests opt in explicitly; prevents host
  // env (e.g. a developer's real GOOGLE_CLIENT_ID) from leaking into wiring.
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.FACEBOOK_CLIENT_ID;
  delete process.env.FACEBOOK_CLIENT_SECRET;
  vi.resetModules();
});

/** Helper: override NODE_ENV, working around possible non-configurable descriptor. */
function overrideNodeEnv(value: string) {
  try {
    Object.defineProperty(process.env, "NODE_ENV", {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // If the descriptor is locked (non-configurable), fall back to direct write.
    // This works in most V8-based test runners even when defineProperty fails.
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = value;
  }
}

afterEach(() => {
  delete process.env.AUTH_E2E;
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_E2E_ALLOW_PROD;
  delete process.env.AUTH_URL;
  delete process.env.NEXTAUTH_URL;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.FACEBOOK_CLIENT_ID;
  delete process.env.FACEBOOK_CLIENT_SECRET;
  // Reset NODE_ENV to the test default.
  overrideNodeEnv("test");
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

    const { resolveE2eUser } = await import("@/lib/auth-callbacks");
    await import("./auth");
    expect(capturedAuthorize).toBeTypeOf("function");

    // Call the captured authorize — resolveE2eUser is mocked above
    const result = await capturedAuthorize!({});
    expect(result).toMatchObject({ id: "mock-user-id", name: "Mock" });
    expect(resolveE2eUser).toHaveBeenCalledWith("e2e-user");
  });

  it("e2e authorize uses the provided handle", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_E2E = "1";

    const { resolveE2eUser } = await import("@/lib/auth-callbacks");
    await import("./auth");
    expect(capturedAuthorize).toBeTypeOf("function");

    const result = await capturedAuthorize!({ handle: "myhandle" });
    expect(result).toMatchObject({ id: "mock-user-id", name: "Mock" });
    expect(resolveE2eUser).toHaveBeenCalledWith("myhandle");
  });

  it("does NOT include e2e provider when NODE_ENV=production (no AUTH_E2E_ALLOW_PROD)", async () => {
    // Production scenario: AUTH_E2E=1 leaks but NODE_ENV=production and no
    // allow flag → the NODE_ENV gate blocks the provider. This verifies the
    // belt-and-suspenders guard that unit tests can control via NODE_ENV.
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_E2E = "1";
    delete process.env.AUTH_E2E_ALLOW_PROD;
    overrideNodeEnv("production");

    await import("./auth");

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls.at(0)?.hasE2E).toBe(false);
    // authorize was not captured — the credentials block was skipped
    expect(capturedAuthorize).toBeNull();
  });

  it("includes e2e provider when AUTH_E2E=1 and NODE_ENV is not production", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_E2E = "1";
    overrideNodeEnv("test");

    await import("./auth");

    expect(capturedCalls.some((c) => c.hasE2E)).toBe(true);
    expect(capturedAuthorize).toBeTypeOf("function");
  });

  it("includes e2e provider when AUTH_E2E=1 and NODE_ENV=production WITH AUTH_E2E_ALLOW_PROD=1", async () => {
    // E2e webServer scenario: AUTH_E2E=1, NODE_ENV=production (next start), and
    // AUTH_E2E_ALLOW_PROD=1 (set by playwright.config) → provider IS registered.
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_E2E = "1";
    process.env.AUTH_E2E_ALLOW_PROD = "1";
    overrideNodeEnv("production");

    await import("./auth");

    expect(capturedCalls.some((c) => c.hasE2E)).toBe(true);
    expect(capturedAuthorize).toBeTypeOf("function");
  });

  it("THROWS at startup in production when AUTH_E2E_ALLOW_PROD is a non-'1' misconfiguration (#277)", async () => {
    // Hard guard: a forced/mistyped escape hatch in production must fail loudly
    // at module load rather than silently expose the passwordless test login.
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_E2E = "1";
    process.env.AUTH_E2E_ALLOW_PROD = "true";
    overrideNodeEnv("production");

    await expect(import("./auth")).rejects.toThrow(/AUTH_E2E_ALLOW_PROD/);
    // NextAuth must never have been constructed with the leaked test login.
    expect(capturedCalls).toHaveLength(0);
  });
});

describe("auth.ts hardening config", () => {
  it("configures a bounded JWT session lifetime with daily refresh", async () => {
    process.env.AUTH_SECRET = "test-secret";

    await import("./auth");

    const session = capturedCalls.at(0)?.config.session as {
      strategy?: string;
      maxAge?: number;
      updateAge?: number;
    };
    expect(session?.strategy).toBe("jwt");
    expect(session?.maxAge).toBe(60 * 60 * 24 * 30);
    expect(session?.updateAge).toBe(60 * 60 * 24);
  });

  it("passes a single AUTH_SECRET through unchanged", async () => {
    process.env.AUTH_SECRET = "solo-secret";

    await import("./auth");

    expect(capturedCalls.at(0)?.config.secret).toBe("solo-secret");
  });

  it("supports rotation when AUTH_SECRET is comma-separated", async () => {
    process.env.AUTH_SECRET = "new-secret,old-secret";

    await import("./auth");

    expect(capturedCalls.at(0)?.config.secret).toEqual(["new-secret", "old-secret"]);
  });

  it("forces secure cookies when AUTH_URL is https", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_URL = "https://app.example.com";

    await import("./auth");

    expect(capturedCalls.at(0)?.config.useSecureCookies).toBe(true);
  });

  it("does NOT force secure cookies without an https URL (http e2e server stays working)", async () => {
    process.env.AUTH_SECRET = "test-secret";
    delete process.env.AUTH_URL;

    await import("./auth");

    expect(capturedCalls.at(0)?.config).not.toHaveProperty("useSecureCookies");
  });

  it("forces secure cookies in production over an https AUTH_URL (#277)", async () => {
    // Production shape: real https origin → useSecureCookies:true so Auth.js v5
    // emits __Secure- prefixed, Secure session cookies. We never set a custom
    // `cookies` config, so httpOnly + sameSite=lax remain the framework secure
    // defaults — we only opt into forcing Secure, never weaken them.
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_URL = "https://www.project50.fit";
    overrideNodeEnv("production");

    await import("./auth");

    expect(capturedCalls.at(0)?.config.useSecureCookies).toBe(true);
    // Lock the expectation that we don't ship a custom cookie config that could
    // override Auth.js's secure (httpOnly/secure/sameSite) defaults.
    expect(capturedCalls.at(0)?.config).not.toHaveProperty("cookies");
  });
});

describe("auth.ts magic-link provider (env-gated)", () => {
  it("does NOT register the magic-link provider when email is unconfigured", async () => {
    process.env.AUTH_SECRET = "test-secret";
    mockIsEmailConfigured.mockReturnValue(false);

    await import("./auth");

    const providers = capturedCalls.at(0)!.providers;
    expect(providers.some((p) => p.id === "magic-link")).toBe(false);
    expect(capturedAuthorizeById["magic-link"]).toBeUndefined();
  });

  it("registers the magic-link provider when email is configured", async () => {
    process.env.AUTH_SECRET = "test-secret";
    mockIsEmailConfigured.mockReturnValue(true);

    await import("./auth");

    const providers = capturedCalls.at(0)!.providers;
    expect(providers.some((p) => p.id === "magic-link")).toBe(true);
    expect(capturedAuthorizeById["magic-link"]).toBeTypeOf("function");
  });

  it("authorize returns { id } when verifyMagicLink resolves a user", async () => {
    process.env.AUTH_SECRET = "test-secret";
    mockIsEmailConfigured.mockReturnValue(true);
    mockVerifyMagicLink.mockResolvedValue("uid-123");

    await import("./auth");
    const authorize = capturedAuthorizeById["magic-link"]!;

    const result = await authorize({ token: "raw-token" });
    expect(mockVerifyMagicLink).toHaveBeenCalledWith("raw-token");
    expect(result).toEqual({ id: "uid-123" });
  });

  it("authorize returns null for an invalid / unresolvable token", async () => {
    process.env.AUTH_SECRET = "test-secret";
    mockIsEmailConfigured.mockReturnValue(true);
    mockVerifyMagicLink.mockResolvedValue(null);

    await import("./auth");
    const authorize = capturedAuthorizeById["magic-link"]!;

    const result = await authorize({ token: "bad" });
    expect(result).toBeNull();
  });

  it("authorize coerces a missing/non-string token to '' before verifying", async () => {
    process.env.AUTH_SECRET = "test-secret";
    mockIsEmailConfigured.mockReturnValue(true);
    mockVerifyMagicLink.mockResolvedValue(null);

    await import("./auth");
    const authorize = capturedAuthorizeById["magic-link"]!;

    await authorize({});
    expect(mockVerifyMagicLink).toHaveBeenCalledWith("");
  });
});

describe("auth.ts OAuth providers (env-gated)", () => {
  it("does NOT register the Google provider when GOOGLE_CLIENT_ID is unset", async () => {
    process.env.AUTH_SECRET = "test-secret";
    delete process.env.GOOGLE_CLIENT_ID;

    await import("./auth");

    const providers = capturedCalls.at(0)!.providers;
    expect(providers.some((p) => p.id === "google")).toBe(false);
  });

  it("registers the Google provider when GOOGLE_CLIENT_ID is set", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.GOOGLE_CLIENT_ID = "g-id";
    process.env.GOOGLE_CLIENT_SECRET = "g-secret";

    await import("./auth");

    const providers = capturedCalls.at(0)!.providers;
    expect(providers.some((p) => p.id === "google")).toBe(true);
  });

  it("does NOT register the Facebook provider when FACEBOOK_CLIENT_ID is unset", async () => {
    process.env.AUTH_SECRET = "test-secret";
    delete process.env.FACEBOOK_CLIENT_ID;

    await import("./auth");

    const providers = capturedCalls.at(0)!.providers;
    expect(providers.some((p) => p.id === "facebook")).toBe(false);
  });

  it("registers the Facebook provider when FACEBOOK_CLIENT_ID is set", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.FACEBOOK_CLIENT_ID = "fb-id";
    process.env.FACEBOOK_CLIENT_SECRET = "fb-secret";

    await import("./auth");

    const providers = capturedCalls.at(0)!.providers;
    expect(providers.some((p) => p.id === "facebook")).toBe(true);
  });

  it("registers Facebook but not Google when only FACEBOOK_CLIENT_ID is set (production shape)", async () => {
    // Mirrors the intended production env: Google OAuth not yet configured,
    // Facebook is. Google must be absent; Facebook must remain.
    process.env.AUTH_SECRET = "test-secret";
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.FACEBOOK_CLIENT_ID = "fb-id";

    await import("./auth");

    const providers = capturedCalls.at(0)!.providers;
    expect(providers.some((p) => p.id === "google")).toBe(false);
    expect(providers.some((p) => p.id === "facebook")).toBe(true);
  });

  it("registers both OAuth providers when both client ids are set (e2e shape)", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.GOOGLE_CLIENT_ID = "g-id";
    process.env.FACEBOOK_CLIENT_ID = "fb-id";

    await import("./auth");

    const providers = capturedCalls.at(0)!.providers;
    expect(providers.some((p) => p.id === "google")).toBe(true);
    expect(providers.some((p) => p.id === "facebook")).toBe(true);
  });
});
