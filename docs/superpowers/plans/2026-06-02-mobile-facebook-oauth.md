# Mobile Facebook OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can tap "Continue with Facebook" in the mobile app, complete the FB dialog, and land authenticated, with API calls authorized via a Bearer token the backend accepts.

**Architecture:** A new backend endpoint (outside the NextAuth `/api/auth/*` catch-all) exchanges the FB OAuth code for a profile, resolves/creates the user via shared identity logic, and mints a NextAuth-compatible JWT. `requireUser()` gains a `Authorization: Bearer` fallback that decodes that JWT. Mobile points its exchange call at the new endpoint and gains a Sign-In screen.

**Tech Stack:** Next.js 15 App Router, NextAuth/Auth.js v5 (`@auth/core/jwt` `encode`/`decode`), Prisma, vitest (web, real test DB via `@/test/db`), Expo `expo-auth-session`, jest-expo (mobile).

---

## File Structure

- `apps/web/lib/auth-callbacks.ts` — **modify**: extract `resolveOAuthUser`, refactor `onSignIn` to use it.
- `apps/web/lib/mobile-session.ts` — **create**: `mintSessionToken`, `readBearerUser`, `SESSION_SALT`.
- `apps/web/lib/session.ts` — **modify**: `requireUser()` Bearer fallback.
- `apps/web/app/api/mobile/auth/[provider]/route.ts` — **create**: code-exchange endpoint.
- `apps/mobile/src/lib/session.ts` — **modify**: exchange path, `usePKCE:false`, thread `redirectUri`.
- `apps/mobile/src/screens/SignInScreen.tsx` — **create**: FB sign-in UI.
- `apps/mobile/src/navigation/AppNavigator.tsx` — **modify**: register SignIn route.
- `.env.example`, `apps/web/.env.example`, `apps/mobile/.env.example` — **create/modify**: documented placeholders (item b).

Tests colocated: `*.test.ts(x)` next to each source file, matching existing convention.

---

## Task 1: Extract shared `resolveOAuthUser`

**Files:**
- Modify: `apps/web/lib/auth-callbacks.ts`
- Test: `apps/web/lib/auth-callbacks.resolve.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll } from "vitest";
import { resolveOAuthUser } from "./auth-callbacks";
import { prisma, resetDb } from "@/test/db";

beforeEach(resetDb);
afterAll(async () => { await prisma.$disconnect(); });

describe("resolveOAuthUser", () => {
  it("creates a User + Identity for a new identity and returns the uid", async () => {
    const uid = await resolveOAuthUser({
      provider: "FACEBOOK", providerAccountId: "fb-1",
      name: "Alice", email: "alice@example.com",
    });
    const identity = await prisma.identity.findUnique({
      where: { provider_providerAccountId: { provider: "FACEBOOK", providerAccountId: "fb-1" } },
      include: { user: true },
    });
    expect(identity?.user.id).toBe(uid);
    expect(identity?.user.handle).toBe("alice");
  });

  it("reuses the existing user for a known identity and refreshes displayName", async () => {
    const first = await resolveOAuthUser({ provider: "FACEBOOK", providerAccountId: "fb-2", name: "Bob" });
    const second = await resolveOAuthUser({ provider: "FACEBOOK", providerAccountId: "fb-2", name: "Bobby" });
    expect(second).toBe(first);
    const user = await prisma.user.findUnique({ where: { id: first } });
    expect(user?.displayName).toBe("Bobby");
  });

  it("disambiguates colliding handles", async () => {
    const a = await resolveOAuthUser({ provider: "FACEBOOK", providerAccountId: "fb-3", email: "sam@a.com" });
    const b = await resolveOAuthUser({ provider: "GOOGLE", providerAccountId: "g-3", email: "sam@b.com" });
    const ua = await prisma.user.findUnique({ where: { id: a } });
    const ub = await prisma.user.findUnique({ where: { id: b } });
    expect(new Set([ua?.handle, ub?.handle]).size).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/web exec vitest run lib/auth-callbacks.resolve.test.ts`
Expected: FAIL — `resolveOAuthUser` is not exported.

- [ ] **Step 3: Implement `resolveOAuthUser` and refactor `onSignIn`**

In `apps/web/lib/auth-callbacks.ts`, add the exported function and rewrite `onSignIn` to delegate. Keep `uniqueHandle` as-is.

```ts
export async function resolveOAuthUser(params: {
  provider: "GOOGLE" | "FACEBOOK";
  providerAccountId: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}): Promise<string> {
  const { provider, providerAccountId, name, email, image } = params;

  const existing = await prisma.identity.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: { user: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.user.id },
      data: {
        displayName: name ?? existing.user.displayName,
        avatarUrl: image ?? undefined,
      },
    });
    return existing.user.id;
  }

  const rawHandle = email ?? name ?? providerAccountId;
  const base = (rawHandle.split("@")[0] || providerAccountId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const handle = await uniqueHandle(base);

  const dbUser = await prisma.user.create({
    data: { handle, displayName: name ?? handle, avatarUrl: image ?? undefined },
  });
  await prisma.identity.create({
    data: { userId: dbUser.id, provider, providerAccountId },
  });
  return dbUser.id;
}
```

Replace the body of `onSignIn` (after the provider mapping) with:

```ts
export async function onSignIn({
  user,
  account,
}: {
  user: User;
  account?: Account | null;
}): Promise<boolean> {
  if (!account || account.provider === "e2e") return true;

  const provider =
    account.provider === "google" ? "GOOGLE"
    : account.provider === "facebook" ? "FACEBOOK"
    : null;
  if (!provider) return false;

  user.id = await resolveOAuthUser({
    provider,
    providerAccountId: account.providerAccountId,
    name: user.name,
    email: user.email,
    image: user.image,
  });
  return true;
}
```

- [ ] **Step 4: Run tests to verify pass (new + existing onSignIn tests)**

Run: `pnpm --filter @project50/web exec vitest run lib/auth-callbacks`
Expected: PASS — both `auth-callbacks.resolve.test.ts` and the existing `auth-callbacks.integration.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth-callbacks.ts apps/web/lib/auth-callbacks.resolve.test.ts
git commit -m "refactor(web): extract resolveOAuthUser shared by NextAuth + mobile"
```

---

## Task 2: Session-token mint/read helpers

**Files:**
- Create: `apps/web/lib/mobile-session.ts`
- Test: `apps/web/lib/mobile-session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { mintSessionToken, readBearerUser } from "./mobile-session";

beforeAll(() => { process.env.AUTH_SECRET = "test-secret-please-change"; });

describe("mobile-session", () => {
  it("mints a token that decodes back to the uid", async () => {
    const token = await mintSessionToken("user-123");
    expect(typeof token).toBe("string");
    const uid = await readBearerUser(`Bearer ${token}`);
    expect(uid).toBe("user-123");
  });

  it("returns null for a missing/malformed Authorization header", async () => {
    expect(await readBearerUser(null)).toBeNull();
    expect(await readBearerUser("Basic abc")).toBeNull();
    expect(await readBearerUser("Bearer not-a-jwt")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/web exec vitest run lib/mobile-session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

```ts
import { encode, decode } from "next-auth/jwt";

/**
 * Salt for JWT encode/decode. Must equal the session cookie name so that
 * dev/e2e tokens (extracted from the cookie) decode with the same salt as
 * tokens we mint here. Auth.js v5 default over http is "authjs.session-token".
 */
export const SESSION_SALT = "authjs.session-token";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

/** Mint a NextAuth-compatible session JWT carrying the user id. */
export async function mintSessionToken(uid: string): Promise<string> {
  return encode({
    token: { uid },
    secret: secret(),
    salt: SESSION_SALT,
    maxAge: THIRTY_DAYS_SECONDS,
  });
}

/** Decode an `Authorization: Bearer <jwt>` header into a uid, or null. */
export async function readBearerUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const [scheme, raw] = authHeader.split(" ");
  if (scheme !== "Bearer" || !raw) return null;
  try {
    const payload = await decode({ token: raw, secret: secret(), salt: SESSION_SALT });
    const uid = (payload as { uid?: string } | null)?.uid;
    return uid ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project50/web exec vitest run lib/mobile-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/mobile-session.ts apps/web/lib/mobile-session.test.ts
git commit -m "feat(web): JWT session-token mint/read for mobile Bearer auth"
```

---

## Task 3: `requireUser()` Bearer fallback

**Files:**
- Modify: `apps/web/lib/session.ts`
- Test: `apps/web/lib/session.test.ts` (extend)

- [ ] **Step 1: Write the failing tests (extend existing file)**

Add to `apps/web/lib/session.test.ts`. The cookie path tests already exist; add Bearer cases. Mock `next/headers` and `./mobile-session`:

```ts
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("./mobile-session", () => ({ readBearerUser: vi.fn() }));
import { headers } from "next/headers";
import { readBearerUser } from "./mobile-session";

describe("requireUser — Bearer fallback", () => {
  it("returns uid from Bearer token when there is no cookie session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(headers).mockResolvedValue({ get: () => "Bearer tok" } as never);
    vi.mocked(readBearerUser).mockResolvedValue("u-bearer");
    await expect(requireUser()).resolves.toBe("u-bearer");
  });

  it("throws when neither cookie nor Bearer yields a user", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(headers).mockResolvedValue({ get: () => null } as never);
    vi.mocked(readBearerUser).mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
```

Note: the existing cookie-path tests must still pass — they don't set up `headers`/`readBearerUser`, so the cookie branch must `return` before touching them.

- [ ] **Step 2: Run test to verify the new ones fail**

Run: `pnpm --filter @project50/web exec vitest run lib/session.test.ts`
Expected: FAIL on the two new Bearer cases (cookie cases still pass).

- [ ] **Step 3: Implement the fallback**

Rewrite `apps/web/lib/session.ts`:

```ts
import { auth } from "@/auth";
import { headers } from "next/headers";
import { readBearerUser } from "./mobile-session";

export class UnauthorizedError extends Error {}

/** Returns the authenticated user id, or throws UnauthorizedError. */
export async function requireUser(): Promise<string> {
  const session = await auth();
  const cookieId = (session?.user as { id?: string } | undefined)?.id;
  if (cookieId) return cookieId;

  const headerList = await headers();
  const bearerId = await readBearerUser(headerList.get("authorization"));
  if (bearerId) return bearerId;

  throw new UnauthorizedError("unauthenticated");
}
```

- [ ] **Step 4: Run test to verify all pass**

Run: `pnpm --filter @project50/web exec vitest run lib/session.test.ts`
Expected: PASS (cookie + Bearer cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/session.ts apps/web/lib/session.test.ts
git commit -m "feat(web): requireUser accepts Authorization: Bearer token"
```

---

## Task 4: Mobile code-exchange endpoint

**Files:**
- Create: `apps/web/app/api/mobile/auth/[provider]/route.ts`
- Test: `apps/web/app/api/mobile/auth/[provider]/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/auth-callbacks", () => ({ resolveOAuthUser: vi.fn() }));
vi.mock("@/lib/mobile-session", () => ({ mintSessionToken: vi.fn() }));
import { resolveOAuthUser } from "@/lib/auth-callbacks";
import { mintSessionToken } from "@/lib/mobile-session";

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.FACEBOOK_CLIENT_ID = "appid";
  process.env.FACEBOOK_CLIENT_SECRET = "secret";
});

function req(body: unknown) {
  return new Request("http://test/api/mobile/auth/facebook", {
    method: "POST", body: JSON.stringify(body),
  });
}
const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) });

describe("POST /api/mobile/auth/[provider]", () => {
  it("exchanges code, resolves user, returns minted token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fb-at" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "fb-1", name: "Al", email: "a@x.com" }), { status: 200 }));
    vi.mocked(resolveOAuthUser).mockResolvedValue("uid-9");
    vi.mocked(mintSessionToken).mockResolvedValue("minted-jwt");

    const res = await POST(req({ code: "c", redirectUri: "project50://redirect" }), ctx("facebook"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "minted-jwt" });
    expect(resolveOAuthUser).toHaveBeenCalledWith(expect.objectContaining({
      provider: "FACEBOOK", providerAccountId: "fb-1", email: "a@x.com",
    }));
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/web exec vitest run "app/api/mobile/auth/[provider]/route.test.ts"`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement the route**

```ts
import { handleRoute, unprocessable } from "@/lib/api/http";
import { resolveOAuthUser } from "@/lib/auth-callbacks";
import { mintSessionToken } from "@/lib/mobile-session";

const GRAPH = "https://graph.facebook.com/v19.0";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  return handleRoute(async () => {
    const { provider } = await ctx.params;
    if (provider !== "facebook") unprocessable("UNSUPPORTED_PROVIDER");

    const body = await req.json().catch(() => ({}));
    const code: string | undefined = body?.code;
    const redirectUri: string | undefined = body?.redirectUri;
    if (!code || !redirectUri) unprocessable("MISSING_CODE");

    const clientId = process.env.FACEBOOK_CLIENT_ID;
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Facebook OAuth env not configured");
    }

    // 1. Exchange code -> FB access token
    const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) unprocessable("FB_EXCHANGE_FAILED");
    const { access_token: fbToken } = (await tokenRes.json()) as { access_token?: string };
    if (!fbToken) unprocessable("FB_EXCHANGE_FAILED");

    // 2. Fetch profile
    const meUrl = new URL(`${GRAPH}/me`);
    meUrl.searchParams.set("fields", "id,name,email");
    meUrl.searchParams.set("access_token", fbToken);
    const meRes = await fetch(meUrl);
    if (!meRes.ok) unprocessable("FB_PROFILE_FAILED");
    const profile = (await meRes.json()) as { id?: string; name?: string; email?: string };
    if (!profile.id) unprocessable("FB_PROFILE_FAILED");

    // 3. Resolve user + 4. mint token
    const uid = await resolveOAuthUser({
      provider: "FACEBOOK",
      providerAccountId: profile.id,
      name: profile.name ?? null,
      email: profile.email ?? null,
    });
    const token = await mintSessionToken(uid);
    return Response.json({ token });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project50/web exec vitest run "app/api/mobile/auth/[provider]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/mobile/auth/[provider]/route.ts" "apps/web/app/api/mobile/auth/[provider]/route.test.ts"
git commit -m "feat(web): mobile FB OAuth code-exchange endpoint"
```

---

## Task 5: Mobile session wiring

**Files:**
- Modify: `apps/mobile/src/lib/session.ts`
- Test: `apps/mobile/src/lib/session.test.ts` (update)

- [ ] **Step 1: Update the failing tests**

In `apps/mobile/src/lib/session.test.ts`, update the `handleOAuthResult` / `signInWithFacebook` expectations to the new contract: the POST goes to `/api/mobile/auth/facebook` with body `{ code, redirectUri }`. Replace the relevant `describe` block with:

```ts
describe("signInWithFacebook", () => {
  it("posts {code, redirectUri} to the mobile exchange endpoint and stores the token", async () => {
    mockFetchOk({ token: "sess-tok" });
    const result = makeSuccessResult("auth-code", "state-1");
    const token = await signInWithFacebook(result, "project50://redirect", "http://localhost:3000");

    expect(token).toBe("sess-tok");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/mobile/auth/facebook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "auth-code", redirectUri: "project50://redirect" }),
      }),
    );
    expect(apiClient.setToken).toHaveBeenCalledWith("sess-tok");
  });

  it("returns null when the auth result was not a success", async () => {
    const token = await signInWithFacebook({ type: "cancel" } as never, "project50://redirect");
    expect(token).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/mobile exec jest src/lib/session.test.ts`
Expected: FAIL — old signature/path.

- [ ] **Step 3: Update the implementation**

In `apps/mobile/src/lib/session.ts`:

a) Add a shared redirect URI constant near the OAuth section:

```ts
/** The native redirect URI; must be whitelisted in the FB app's Valid OAuth Redirect URIs. */
export const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: "project50" });
```

b) Set `usePKCE: false` in both `buildGoogleAuthRequest` and `buildFacebookAuthRequest`, and use `REDIRECT_URI`:

```ts
export function buildFacebookAuthRequest(): ReturnType<typeof AuthSession.useAuthRequest> {
  return AuthSession.useAuthRequest(
    {
      clientId: process.env["EXPO_PUBLIC_FACEBOOK_APP_ID"] ?? "",
      scopes: ["public_profile", "email"],
      redirectUri: REDIRECT_URI,
      usePKCE: false,
    },
    {
      authorizationEndpoint: "https://www.facebook.com/v19.0/dialog/oauth",
      tokenEndpoint: "https://graph.facebook.com/v19.0/oauth/access_token",
    },
  );
}
```

(Apply the same `usePKCE: false` + `redirectUri: REDIRECT_URI` to `buildGoogleAuthRequest`.)

c) Change `handleOAuthResult` to take `redirectUri` and send it:

```ts
export async function handleOAuthResult(
  result: AuthSession.AuthSessionResult,
  exchangePath: string,
  redirectUri: string,
  baseUrl?: string,
): Promise<string | null> {
  if (result.type !== "success") return null;
  const base = baseUrl ?? process.env["EXPO_PUBLIC_API_BASE_URL"] ?? "http://localhost:3000";

  const resp = await fetch(`${base}${exchangePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: result.params["code"], redirectUri }),
  });
  if (!resp.ok) throw new Error(`OAuth token exchange failed: ${resp.status}`);

  const bodyJson = (await resp.json()) as { token?: string; sessionToken?: string };
  const token = bodyJson.token ?? bodyJson.sessionToken ?? null;
  if (token) {
    await saveToken(token);
    apiClient.setToken(token);
  }
  return token;
}
```

d) Update the provider sign-in wrappers:

```ts
export async function signInWithGoogle(
  result: AuthSession.AuthSessionResult,
  redirectUri: string,
  baseUrl?: string,
): Promise<string | null> {
  return handleOAuthResult(result, "/api/mobile/auth/google", redirectUri, baseUrl);
}

export async function signInWithFacebook(
  result: AuthSession.AuthSessionResult,
  redirectUri: string,
  baseUrl?: string,
): Promise<string | null> {
  return handleOAuthResult(result, "/api/mobile/auth/facebook", redirectUri, baseUrl);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project50/mobile exec jest src/lib/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/session.ts apps/mobile/src/lib/session.test.ts
git commit -m "feat(mobile): point FB OAuth at mobile exchange endpoint, disable PKCE"
```

---

## Task 6: Sign-In screen + navigation

**Files:**
- Create: `apps/mobile/src/screens/SignInScreen.tsx`
- Test: `apps/mobile/src/screens/SignInScreen.test.tsx`
- Modify: `apps/mobile/src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const promptAsync = jest.fn();
jest.mock("../lib/session", () => ({
  buildFacebookAuthRequest: () => [{}, null, promptAsync],
  signInWithFacebook: jest.fn().mockResolvedValue("tok"),
  REDIRECT_URI: "project50://redirect",
}));

import { SignInScreen } from "./SignInScreen";

describe("SignInScreen", () => {
  it("renders the Facebook button and triggers promptAsync on press", async () => {
    const { getByTestId } = render(<SignInScreen onSignedIn={jest.fn()} />);
    fireEvent.press(getByTestId("signin-facebook"));
    await waitFor(() => expect(promptAsync).toHaveBeenCalled());
  });

  it("calls onSignedIn when the FB auth response succeeds", async () => {
    const onSignedIn = jest.fn();
    const { signInWithFacebook } = require("../lib/session");
    render(<SignInScreen onSignedIn={onSignedIn} _response={{ type: "success", params: { code: "c" } }} />);
    await waitFor(() => expect(signInWithFacebook).toHaveBeenCalled());
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/mobile exec jest src/screens/SignInScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the screen**

```tsx
import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  buildFacebookAuthRequest,
  signInWithFacebook,
  REDIRECT_URI,
} from "../lib/session";

interface SignInScreenProps {
  onSignedIn: () => void;
  /** Test seam to inject an auth response without the native dialog. */
  _response?: { type: string; params?: Record<string, string> };
}

export function SignInScreen({ onSignedIn, _response }: SignInScreenProps) {
  const [, response, promptAsync] = buildFacebookAuthRequest();
  const effective = _response ?? response;

  useEffect(() => {
    if (effective?.type === "success") {
      void signInWithFacebook(effective as never, REDIRECT_URI).then((token) => {
        if (token) onSignedIn();
      });
    }
  }, [effective, onSignedIn]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>project50</Text>
      <Pressable
        testID="signin-facebook"
        style={styles.button}
        onPress={() => void promptAsync()}
      >
        <Text style={styles.buttonText}>Continue with Facebook</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#121013", gap: 24 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  button: { backgroundColor: "#1877F2", paddingVertical: 16, paddingHorizontal: 32, borderRadius: 16 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project50/mobile exec jest src/screens/SignInScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire into AppNavigator**

Open `apps/mobile/src/navigation/AppNavigator.tsx`, import `SignInScreen`, and register it as the initial route shown when no token is stored (follow the file's existing stack-navigator pattern; pass an `onSignedIn` that navigates to the Dashboard route). Keep the change minimal and consistent with existing screens.

- [ ] **Step 6: Run mobile typecheck + full mobile tests**

Run: `pnpm --filter @project50/mobile run typecheck && pnpm --filter @project50/mobile test`
Expected: PASS, coverage maintained.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/SignInScreen.tsx apps/mobile/src/screens/SignInScreen.test.tsx apps/mobile/src/navigation/AppNavigator.tsx
git commit -m "feat(mobile): add Facebook sign-in screen + navigation entry"
```

---

## Task 7: Documented env placeholders (item b)

**Files:**
- Modify: `.env.example`
- Create: `apps/mobile/.env.example`
- Create: `apps/web/.env.example` (only if web-specific docs warranted; otherwise skip — root covers it)

- [ ] **Step 1: Add the mobile public var note to root `.env.example`**

Append after the existing Facebook block:

```
# Mobile (Expo) — public, inlined into the app bundle (NEVER put secrets here).
#   Used by apps/mobile; copy into apps/mobile/.env and restart `expo start -c`.
EXPO_PUBLIC_FACEBOOK_APP_ID=
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

- [ ] **Step 2: Create `apps/mobile/.env.example`**

```
# Expo public env — inlined into the bundle at build time. NEVER put the App Secret here.
# After changing these, fully restart the bundler: `expo start -c`.
EXPO_PUBLIC_FACEBOOK_APP_ID=
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

- [ ] **Step 3: Commit**

```bash
git add .env.example apps/mobile/.env.example
git commit -m "docs: document mobile EXPO_PUBLIC_* env vars"
```

---

## Final verification

- [ ] **Run the full web + mobile suites and typechecks:**

```bash
pnpm --filter @project50/web test && pnpm --filter @project50/web run typecheck
pnpm --filter @project50/mobile test && pnpm --filter @project50/mobile run typecheck
```
Expected: all green, coverage held.

- [ ] **Manual FB-dialog validation (the external-dependency risk):** start the web server with the wired creds, run the mobile app, tap "Continue with Facebook", confirm redirect → token → authenticated API call. If Facebook rejects the `project50://` redirect, capture the exact error for the follow-up (https redirect-bridge decision noted in the spec).

---

## Self-Review

- **Spec coverage:** resolver (T1), JWT helpers (T2), Bearer auth (T3), exchange endpoint (T4), mobile wiring (T5), sign-in UI (T6), env docs/item-b (T7), FB-redirect risk (final verification). All spec sections mapped.
- **Placeholder scan:** AppNavigator wiring (T6 Step 5) is described, not coded, because it must follow the file's existing navigator structure which the executing agent will read; all other code steps are complete.
- **Type consistency:** `resolveOAuthUser({provider,providerAccountId,name,email,image})`, `mintSessionToken(uid)`, `readBearerUser(authHeader)`, `handleOAuthResult(result, exchangePath, redirectUri, baseUrl?)`, `signInWithFacebook(result, redirectUri, baseUrl?)` — names/signatures match across tasks.
