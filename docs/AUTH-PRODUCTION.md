# Auth — Production OAuth Configuration

Runbooks to take **Google** and **Facebook** social login from local dev to
production. These cover only the OAuth provider / console side. For the DNS, TLS,
and canonical-origin work see [DOMAIN-TLS.md](./DOMAIN-TLS.md); for where the
secrets live and how they rotate see [SECRETS.md](./SECRETS.md).

> **Legend.** Steps tagged **TODO** are manual actions in an external console
> (Google Cloud, Meta) or your hosting provider's env/secret store. They cannot
> be done from this repo and are tracked here so nothing is missed at go-live.

## How the code reads OAuth (ground truth)

Both OAuth providers are **ENV-GATED** in `apps/web/auth.ts`: each registers
**only** when its client id is present, and reads the documented env names
explicitly (not the `AUTH_GOOGLE_ID` / `AUTH_FACEBOOK_ID` names Auth.js v5 would
default to):

```ts
// apps/web/auth.ts
if (process.env.GOOGLE_CLIENT_ID) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (process.env.FACEBOOK_CLIENT_ID) {
  providers.push(
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    }),
  );
}
```

> **Google is inert until creds exist (#275, gated off in #259).** With
> `GOOGLE_CLIENT_ID` unset — the current production state — the Google provider
> is **never registered** and the "Continue with Google" button **never
> renders** (the sign-in page gates the button on the same env var, see below).
> The code is production-ready and ships safely now; it **activates the moment**
> `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are present in the runtime env
> (which is the infra follow-up — KV secrets + Container App env wiring in
> `infra/azure/main.tf`, tracked in the production-readiness plan Task 2.1). No
> code change is required to turn Google on. `FACEBOOK_CLIENT_ID` is already set
> in production, so Facebook is live today.

The sign-in button mirrors the same gate. `apps/web/app/signin/page.tsx` is
`force-dynamic` (runtime env read) and passes `googleEnabled =
Boolean(process.env.GOOGLE_CLIENT_ID)` / `facebookEnabled = …` to
`SignInButtons`, so the Google button shows **iff** the Google provider is
registered — they can never drift.

Auth.js v5 mounts its handlers under the catch-all
`apps/web/app/api/auth/[...nextauth]/route.ts`, so the web redirect/callback URLs
follow the standard NextAuth shape:

| Provider | Authorized redirect URI (production) |
| -------- | ------------------------------------ |
| Google   | `https://www.project50.fit/api/auth/callback/google` |
| Facebook | `https://www.project50.fit/api/auth/callback/facebook` |

`<domain>` is your canonical https origin (the same host you put in `AUTH_URL`).
The live production origin is **`https://www.project50.fit`** (the `www`
subdomain — apex does not get a managed cert cleanly; see DOMAIN-TLS.md), so the
exact Google production redirect URI to register is
**`https://www.project50.fit/api/auth/callback/google`** and the
**Authorized JavaScript origin** is **`https://www.project50.fit`**. In local dev
these are `http://localhost:3000/api/auth/callback/google` and `.../facebook`
(see `.env.example`).

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

## Google (#48 / #275)

> **Status: inert in code, off in production until the steps below are done.**
> The Google provider and the "Continue with Google" button are wired and
> tested, but env-gated on `GOOGLE_CLIENT_ID` (gated off in #259). Nothing about
> the running app changes until you complete steps 1–3 here **and** the infra
> follow-up lands the `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` runtime env via
> KV (production-readiness plan Task 2.1 — `infra/azure/main.tf`, mirror the
> Facebook block). Do these in order, then verify (step 5).

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
   - **Authorized redirect URIs:** add the production callback **exactly**:
     `https://www.project50.fit/api/auth/callback/google` (and
     `http://localhost:3000/api/auth/callback/google` for dev if sharing the
     client). No trailing slash; the `www` must match.
   - **Authorized JavaScript origins:** add `https://www.project50.fit`. Not
     strictly required for this server-side flow, but register it per #275 so
     the origin is allow-listed.
5. Copy the generated **Client ID** and **Client secret**.

### 2. Publishing status — **TODO** (Google Cloud Console)

- While the consent screen is in **Testing**, only listed **Test users** can
  sign in (and refresh tokens expire after 7 days). Fine for staging.
- For production click **Publish app** to move to **In production**. Because the
  app uses only non-sensitive scopes (email/profile/openid), this is allowed
  **without** Google's app-verification review. The consent screen will show an
  "unverified app" notice only if/when sensitive scopes are added.

### 3. Wire the env vars — **TODO** (env/secret store; infra follow-up)

Set, in the production runtime env (and the secret store per
[SECRETS.md](./SECRETS.md)):

| Var | Value | Notes |
| --- | ----- | ----- |
| `GOOGLE_CLIENT_ID` | OAuth client ID from step 1.5 | Read in `apps/web/auth.ts`. Not secret on its own. |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret from step 1.5 | **Highly sensitive.** Rotate per SECRETS.md (Google allows two secrets concurrently → zero-downtime rotation). |

> **Infra follow-up (not this branch).** On Azure these env vars are injected at
> runtime from Key Vault, so wiring them is a Terraform change, **not** a code
> change. The steps (tracked in production-readiness plan Task 2.1, owned
> separately from this code PR):
>
> 1. `az keyvault secret set --vault-name kv-project50-dev-6z7n --name google-client-id --value <id>`
>    and `... --name google-client-secret --value <secret>`.
> 2. In `infra/azure/main.tf`, add the two **versionless** KV secret refs +
>    `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` Container App env entries —
>    **mirror the existing Facebook block** exactly.
> 3. `terraform apply` (then force a new revision so the versionless secret ref
>    is picked up immediately rather than after the ~30-min cache).
>
> Until those land, `GOOGLE_CLIENT_ID` is absent in production → the Google
> provider stays unregistered and the button stays hidden. **Safe to ship the
> code now.**

### 4. Verify activation — **TODO** (after steps 1–3 + infra wiring)

Confirm the redirect carries the **real** client id (the same check used for
Facebook):

1. Load `https://www.project50.fit/signin` — the **"Continue with Google"**
   button should now render (it was hidden while `GOOGLE_CLIENT_ID` was unset).
2. Click it and (with DevTools → Network open) inspect the resulting redirect to
   `accounts.google.com/o/oauth2/v2/auth?...` (Auth.js POSTs to
   `/api/auth/signin/google` with the CSRF token, then 302s to Google). The
   **`client_id=`** query param must be your real Google client id (not blank,
   not a placeholder), `redirect_uri=` must be the exact
   `https://www.project50.fit/api/auth/callback/google`, and `scope=` must
   include `openid email profile`.
3. Complete a real Google sign-in end-to-end; the session cookie should be
   `__Secure-`-prefixed (https → `shouldUseSecureCookies()` returns true).

If the button is missing, `GOOGLE_CLIENT_ID` is not reaching the runtime
(re-check the KV ref / revision). If you get `redirect_uri_mismatch`, the
registered URI doesn't byte-for-byte match step 1.4.

### 5. Mobile Google sign-in — **known gap / follow-up TODO** (code)

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
- [ ] Google: redirect URI `https://www.project50.fit/api/auth/callback/google`
      + JS origin `https://www.project50.fit` registered (exact match).
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set in prod (KV → Container App
      env via TF, mirroring the Facebook block — Task 2.1).
- [ ] Google: verified the `/signin` Google button renders and the authorize
      redirect carries the **real** `client_id` (Google §4).
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
