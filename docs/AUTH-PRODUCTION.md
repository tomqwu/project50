# Auth — Production OAuth Configuration

Runbooks to take **Google** and **Facebook** social login from local dev to
production. These cover only the OAuth provider / console side. For the DNS, TLS,
and canonical-origin work see [DOMAIN-TLS.md](./DOMAIN-TLS.md); for where the
secrets live and how they rotate see [SECRETS.md](./SECRETS.md).

> **Legend.** Steps tagged **TODO** are manual actions in an external console
> (Google Cloud, Meta) or your hosting provider's env/secret store. They cannot
> be done from this repo and are tracked here so nothing is missed at go-live.

## How the code reads OAuth (ground truth)

The app constructs both providers in `apps/web/auth.ts` and reads the documented
env names explicitly (not the `AUTH_GOOGLE_ID` / `AUTH_FACEBOOK_ID` names Auth.js
v5 would default to):

```ts
// apps/web/auth.ts
Google({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
}),
Facebook({
  clientId: process.env.FACEBOOK_CLIENT_ID,
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
}),
```

Auth.js v5 mounts its handlers under the catch-all
`apps/web/app/api/auth/[...nextauth]/route.ts`, so the web redirect/callback URLs
follow the standard NextAuth shape:

| Provider | Authorized redirect URI (production) |
| -------- | ------------------------------------ |
| Google   | `https://<domain>/api/auth/callback/google` |
| Facebook | `https://<domain>/api/auth/callback/facebook` |

`<domain>` is your canonical https origin (the same host you put in `AUTH_URL`).
In local dev these are `http://localhost:3000/api/auth/callback/google` and
`.../facebook` (see `.env.example`).

---

## Shared prerequisites (do these first)

1. **Pick the canonical https origin.** Settle apex-vs-`www` per
   [DOMAIN-TLS.md](./DOMAIN-TLS.md) *before* registering redirect URIs — the URI
   must exactly match the host users actually land on.

2. **Set `AUTH_URL` to that https origin.** Auth.js builds its callback URLs from
   `AUTH_URL`, and the same value gates Secure session cookies:
   `shouldUseSecureCookies()` in `apps/web/lib/auth-config.ts` returns `true`
   **only** when `AUTH_URL` starts with `https://` (falling back to the legacy
   `NEXTAUTH_URL`):

   ```ts
   // apps/web/lib/auth-config.ts — shouldUseSecureCookies()
   const url = env.AUTH_URL ?? env.NEXTAUTH_URL;
   return url?.startsWith("https://") ? true : undefined;
   ```

   If `AUTH_URL` is missing or `http://` in production, session cookies are not
   marked `Secure` and login will appear to "not stick." **TODO** (env/secret
   store): set `AUTH_URL=https://<domain>`. See the `AUTH_URL` row in
   [SECRETS.md](./SECRETS.md) (plain config, not a secret).

3. **Redirect-URI exact-match.** Google and Meta both require an *exact* string
   match (scheme + host + path, no trailing slash, no extra/missing `www`). A
   mismatch yields `redirect_uri_mismatch` (Google) / "URL Blocked" (Facebook).
   Register the production URI(s) *and* keep the `localhost` dev URIs if the same
   client is used for dev.

4. **No action for the e2e provider.** A `Credentials` provider id `e2e` exists
   in `auth.ts` for Playwright, double-gated behind `AUTH_E2E === "1"` **and**
   `NODE_ENV !== "production"` (unless `AUTH_E2E_ALLOW_PROD=1`). `AUTH_E2E` is
   never set in production, so it is inert there. Nothing to configure or
   disable.

---

## Google (#48)

### 1. Create / configure the OAuth client — **TODO** (Google Cloud Console)

1. In **Google Cloud Console** pick (or create) the project that owns
   production auth.
2. **APIs & Services → OAuth consent screen.**
   - **User type:** `External` (so any Google user can sign in).
   - Fill in **App name**, **User support email**, **App logo** (optional),
     **App domain** (your production domain), **Authorized domains** (the
     registrable domain, e.g. `project50.app`), and **Developer contact email**.
3. **Scopes.** The app only needs basic profile + email. Add the
   **non-sensitive** scopes:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`

   These are **not** "sensitive" or "restricted" scopes, so Google verification
   is **not required** for them — see Publishing status below. (If you ever add a
   sensitive/restricted scope, e.g. Drive/Gmail, you must complete Google's
   verification + possibly a security assessment first.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   - **Application type:** `Web application`.
   - **Authorized redirect URIs:** add
     `https://<domain>/api/auth/callback/google` (and
     `http://localhost:3000/api/auth/callback/google` for dev if sharing the
     client).
   - **Authorized JavaScript origins** are not required for this server-side
     flow but may be added (`https://<domain>`) without harm.
5. Copy the generated **Client ID** and **Client secret**.

### 2. Publishing status — **TODO** (Google Cloud Console)

- While the consent screen is in **Testing**, only listed **Test users** can
  sign in (and refresh tokens expire after 7 days). Fine for staging.
- For production click **Publish app** to move to **In production**. Because the
  app uses only non-sensitive scopes (email/profile/openid), this is allowed
  **without** Google's app-verification review. The consent screen will show an
  "unverified app" notice only if/when sensitive scopes are added.

### 3. Wire the env vars — **TODO** (env/secret store)

Set, in your hosting provider's env (and the secret store per
[SECRETS.md](./SECRETS.md)):

| Var | Value | Notes |
| --- | ----- | ----- |
| `GOOGLE_CLIENT_ID` | OAuth client ID from step 1.5 | Read in `apps/web/auth.ts`. Not secret on its own. |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret from step 1.5 | **Highly sensitive.** Rotate per SECRETS.md (Google allows two secrets concurrently → zero-downtime rotation). |

### 4. Mobile Google sign-in — **known gap / follow-up TODO** (code)

The mobile app already attempts a Google code-exchange: `apps/mobile/src/lib/session.ts`
POSTs to **`/api/mobile/auth/google`**. However the **web** exchange route
`apps/web/app/api/mobile/auth/[provider]/route.ts` currently implements
**Facebook only** and rejects everything else:

```ts
// apps/web/app/api/mobile/auth/[provider]/route.ts
if (provider !== "facebook") unprocessable("UNSUPPORTED_PROVIDER");
```

> **Follow-up required:** native (mobile) Google sign-in will fail with
> `UNSUPPORTED_PROVIDER` until a Google branch is added to that handler
> (exchange the Google `code` for a token, fetch the profile, then
> `resolveOAuthUser({ provider: "GOOGLE", ... })` and `mintSessionToken`). This
> is a code change, not a console step. **Web** Google sign-in is unaffected —
> it goes through the NextAuth callback above and works once steps 1–3 are done.
> Mobile will also need `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (read in
> `apps/mobile/src/lib/session.ts`) and a Google client configured for the
> native redirect URI.

---

## Facebook (#49)

### 1. Create / configure the app — **TODO** (Meta App Dashboard)

1. In the **Meta App Dashboard** (developers.facebook.com) create an app (type
   **Consumer**, or **Business** if you need Business verification).
2. Add the **Facebook Login** product to the app.
3. **Facebook Login → Settings → Valid OAuth Redirect URIs:** add
   `https://<domain>/api/auth/callback/facebook` (and
   `http://localhost:3000/api/auth/callback/facebook` for dev). Keep **Client
   OAuth Login** and **Web OAuth Login** enabled.
4. **Settings → Basic:** record the **App ID** and **App Secret**. Set the
   **App Domain** (your production domain), **Privacy Policy URL**, and **Terms
   of Service URL** (required to go Live — see the legal docs under `docs/legal`).

### 2. Permissions & App Review / Business Verification — **TODO** (Meta)

- The app requests only **`public_profile`** and **`email`** (the server reads
  `id,name,email` from the Graph `/me` endpoint — see the mobile exchange route).
- `public_profile` is granted by default. **`email`** is an advanced permission:
  to make it available to users who are **not** app admins/developers/testers
  (i.e. the general public), you must submit it through **App Review** and
  complete **Business Verification** of the owning business.
- During development you can test with accounts that have a **Role** on the app
  (Admin / Developer / Tester) before review is approved.

### 3. Switch the app to Live — **TODO** (Meta)

- Toggle the app from **Development** to **Live** mode (top of the dashboard).
  This requires a Privacy Policy URL and a completed app category. Until the app
  is Live, only users with a Role on the app can log in.

### 4. Wire the env vars — **TODO** (env/secret store)

| Var | Value | Notes |
| --- | ----- | ----- |
| `FACEBOOK_CLIENT_ID` | App ID (Settings → Basic) | Read in `apps/web/auth.ts`. Also surfaced to mobile as the public `EXPO_PUBLIC_FACEBOOK_APP_ID`. |
| `FACEBOOK_CLIENT_SECRET` | App Secret (Settings → Basic) | **Highly sensitive.** Used by both the web NextAuth provider and the mobile code-exchange route. Meta supports only one secret at a time → schedule a brief rotation window (see SECRETS.md). |

Facebook mobile sign-in **is** supported server-side today: the
`/api/mobile/auth/facebook` exchange route is implemented (unlike Google above).

---

## Go-live checklist

- [ ] Canonical https origin chosen (apex vs `www`) — DOMAIN-TLS.md.
- [ ] `AUTH_URL=https://<domain>` set in production env/secret store.
- [ ] Google: consent screen configured, **Published / In production**, scopes
      limited to email/profile/openid (no verification needed).
- [ ] Google: redirect URI `https://<domain>/api/auth/callback/google`
      registered (exact match).
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set in prod.
- [ ] Facebook: Login product added; redirect URI
      `https://<domain>/api/auth/callback/facebook` registered (exact match).
- [ ] Facebook: `email` permission approved via App Review + Business
      Verification; app switched to **Live**.
- [ ] `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` set in prod.
- [ ] (Follow-up) Google mobile exchange handler added to
      `apps/web/app/api/mobile/auth/[provider]/route.ts` if native Google
      sign-in is needed.

## See also

- [DOMAIN-TLS.md](./DOMAIN-TLS.md) — canonical host, TLS, `AUTH_URL`, redirect
  URIs on domain change.
- [SECRETS.md](./SECRETS.md) — `AUTH_URL`, OAuth client IDs/secrets, rotation
  cadence and procedure.
