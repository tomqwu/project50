# Mobile Facebook OAuth — End-to-End Login

**Date:** 2026-06-02
**Branch:** `feat/inc7-mobile-runnable`
**Status:** Approved design (Approach A)

## Problem

The mobile app can build a Facebook `AuthSession` request (`apps/mobile/src/lib/session.ts`)
but login does not work end-to-end:

1. **No backend exchange endpoint.** Mobile POSTs the OAuth `{code, state}` to
   `/api/auth/callback/facebook`, but that path is owned by NextAuth's
   `/api/auth/[...nextauth]` catch-all, which performs a cookie-based browser flow
   and never returns a JSON session token to a native client.
2. **Backend never reads `Authorization: Bearer`.** `requireUser()`
   (`apps/web/lib/session.ts`) authenticates only via the NextAuth cookie (`auth()`).
   The mobile `apiClient` sends auth exclusively as a Bearer token, so even with a
   token in hand, mobile API calls would not authenticate. (This also means the
   existing dev/e2e mobile sign-in path does not actually authenticate API calls.)
3. **No sign-in UI.** `AppNavigator` has no Sign-In screen; nothing calls
   `buildFacebookAuthRequest()` / `promptAsync()`.

## Goal

A user can tap "Continue with Facebook" in the mobile app, complete the Facebook
dialog, and land authenticated — with subsequent API calls authorized via a Bearer
token the backend accepts.

Non-goals (YAGNI): token refresh/rotation, multi-device session management, a
`Session` DB table, Google parity beyond reusing the same plumbing.

## Approach A — NextAuth JWT as Bearer

The mobile session token is a NextAuth-compatible JWT minted by the exchange
endpoint; `requireUser()` gains a Bearer fallback that decodes it. Reuses existing
`AUTH_SECRET` + `uid` claim, and incidentally repairs the dev/e2e Bearer path.

Verified prerequisite: `next-auth/jwt` (→ `@auth/core/jwt`) exports `encode`/`decode`
in this repo's `next-auth@5.0.0-beta.31`.

### Components

**1. Shared identity resolver — `apps/web/lib/auth-callbacks.ts`**
Extract the user-upsert logic currently inside `onSignIn` into:

```
resolveOAuthUser({ provider, providerAccountId, name, email, image }): Promise<string /* uid */>
```

- Resolves by the globally-unique `provider + providerAccountId` (takeover-safe),
  refreshing profile on hit, creating a uniquely-handled user + identity on miss.
- `onSignIn` is refactored to call it (behavior unchanged; existing tests stay green).
- Reused by the new mobile endpoint so both paths share one identity policy.

**2. Session-token helpers — `apps/web/lib/mobile-session.ts` (new)**

```
mintSessionToken(uid: string): Promise<string>   // encode({ token: { uid }, secret, salt, maxAge })
readBearerUser(req | headers): Promise<string | null>  // decode Authorization: Bearer → uid
```

- `salt` is a single shared constant equal to the session cookie name used in this
  environment, so dev-path tokens (extracted from the cookie) and minted mobile
  tokens decode identically.
- `secret` = `AUTH_SECRET`.

**3. Mobile exchange endpoint — `apps/web/app/api/mobile/auth/[provider]/route.ts` (new)**
Lives OUTSIDE `/api/auth/*` to avoid the NextAuth catch-all. `POST` body
`{ code, redirectUri }`:

1. Validate `provider ∈ { facebook }` (google plumbing reserved, same code path).
2. Exchange code with Facebook token endpoint using
   `FACEBOOK_CLIENT_ID` + `FACEBOOK_CLIENT_SECRET` + `redirect_uri` → FB access token.
3. `GET /me?fields=id,name,email` → profile.
4. `resolveOAuthUser({ provider: "FACEBOOK", providerAccountId: id, name, email })` → `uid`.
5. `mintSessionToken(uid)` → respond `{ token }`.

Errors: FB exchange / profile failures → 400 with a safe message; missing env → 500.

**4. `requireUser()` Bearer fallback — `apps/web/lib/session.ts`**
Try `auth()` (cookie) first (web unchanged). If no cookie session, call
`readBearerUser()`; return its `uid` or throw `UnauthorizedError`.

**5. Mobile wiring — `apps/mobile/src/lib/session.ts`**
- Point `signInWithFacebook` / `signInWithGoogle` at `/api/mobile/auth/<provider>`.
- Set `usePKCE: false` on the auth requests (confidential-client exchange needs only
  `code` + secret), keeping the POST body simple (`{ code, redirectUri }`).
- Thread `redirectUri` (the value from `makeRedirectUri`) into `handleOAuthResult`
  so the backend exchange uses the matching URI.

**6. Minimal Sign-In screen — `apps/mobile/src/screens/SignInScreen.tsx` (new)**
- Renders brand + "Continue with Facebook" button; calls
  `buildFacebookAuthRequest()` + `promptAsync()`, then `signInWithFacebook(result)`.
- On success, stores token (already handled in `session.ts`) and navigates to Dashboard.
- Wired as the initial route in `AppNavigator` when no token is stored.

### Data flow

```
[Mobile] tap → promptAsync() → Facebook dialog → redirect project50://?code=…
   → POST /api/mobile/auth/facebook { code, redirectUri }
[Backend] code → FB token → /me → resolveOAuthUser → mintSessionToken → { token }
[Mobile] saveToken + apiClient.setToken(Bearer)
   → GET /api/… Authorization: Bearer <jwt>
[Backend] requireUser(): no cookie → readBearerUser(decode) → uid ✅
```

### Testing (hold repo coverage bar)

- `resolveOAuthUser`: existing-identity reuse, new-user creation, handle-collision.
- `mobile-session`: mint→decode round-trip; bad/expired/absent token → null.
- exchange route: success (mocked FB fetch), FB error, missing env, bad provider.
- `requireUser`: cookie path unchanged; Bearer path success + reject.
- mobile `session.test.ts`: updated path + `{ code, redirectUri }` body + `usePKCE:false`.
- `SignInScreen`: renders, calls prompt, navigates on success (mock auth-session).

## External dependency / risk

Facebook's OAuth dialog is strict about redirect URIs and may reject the
`project50://` custom scheme (it favors `https://`). The backend/code will be
correct; making Meta accept the native redirect may require an https redirect
bridge or specific app config. Validated against the real FB dialog at the end.
This is the one piece outside our code's control.

## Out of scope

Token refresh, logout-everywhere, Google end-to-end UI, Instagram, business
verification / app publishing (tracked separately; required only for public users).
