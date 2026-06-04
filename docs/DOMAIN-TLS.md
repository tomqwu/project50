# Custom Domain, DNS & TLS

A runbook to put the Project 50 **web app** (`apps/web`, a Next.js App Router
app) on a custom domain with HTTPS. The default host is **Vercel** (see
[DEPLOY.md](./DEPLOY.md)); Cloudflare is documented as an alternative for DNS/TLS.

This is an **end-to-end** procedure: it covers the generic DNS/TLS plumbing
**and** the app-specific wiring that must change when the origin URL changes —
auth callback URLs, the `Secure`-cookie switch, OAuth provider config, CSP/CDN
hosts, and HSTS. Skipping the app-specific section will produce a site that
loads but silently breaks sign-in.

> **TODO (your accounts):** anything that requires a registrar login, a Vercel/
> Cloudflare dashboard, or an OAuth provider console is marked **TODO** below —
> those are one-time manual steps done by you, not by code.

Throughout, the example apex domain is `project50.app` (matching the CDN host
`cdn.project50.app` already used in [CDN.md](./CDN.md)). Substitute your own.

---

## TL;DR

1. **Register** a domain (**TODO: registrar**).
2. **Add the domain** to the host (Vercel project → Domains, or Cloudflare) and
   create the **DNS records** it tells you to (apex + `www`).
3. Let the host **provision a managed TLS cert** (automatic, auto-renewing).
4. Pick a **canonical host** (apex *or* `www`) and redirect the other to it.
5. **Wire the app to the new https origin** — this is the part that is easy to
   forget:
   - Set `AUTH_URL` (and/or legacy `NEXTAUTH_URL`) to `https://<canonical-host>`.
     This is what `shouldUseSecureCookies()` keys on for `Secure` session
     cookies (`apps/web/lib/auth-config.ts`).
   - Update **OAuth redirect URIs** (Google + Facebook) to the new
     `/api/auth/callback/<provider>` URLs.
   - Update `S3_PUBLIC_URL` / CDN host if media moves to a domain subhost
     (drives `next.config.mjs` `images.remotePatterns` **and** the CSP) — see
     [CDN.md](./CDN.md).
6. **Verify** https, the redirect, sign-in, image loads, and HSTS.

---

## 1. Choose & register a domain

- Pick an apex (e.g. `project50.app`). Prefer a registrar that supports the DNS
  record types you need (apex `ALIAS`/`ANAME`/flattened `CNAME`, plus `CAA`).
- **TODO: registrar** — register the domain and note where its **nameservers**
  are managed. You will either:
  - keep DNS at the registrar and add records there, **or**
  - delegate DNS to Cloudflare (point the registrar's nameservers at the two
    Cloudflare nameservers Cloudflare assigns), then manage records in
    Cloudflare. Delegating to Cloudflare is what enables option B in §2/§3.

> Set a restrictive `CAA` record once DNS is live so only your cert authority can
> issue certs, e.g. `project50.app. CAA 0 issue "letsencrypt.org"` (Vercel/
> Cloudflare-managed certs) — confirm the exact CA string with your host before
> adding, an over-tight `CAA` will block renewals.

---

## 2. DNS records

You need records for both the **apex** (`project50.app`) and the **`www`**
subdomain. The apex is the awkward one: classic `CNAME` is illegal at a zone
apex, so use the host's apex target mechanism.

### Option A — Vercel (default)

In the Vercel project: **Settings → Domains → Add**. Add both `project50.app`
and `www.project50.app`; Vercel shows the exact target values. Typical records:

| Host                 | Type    | Value                              | Notes                              |
| -------------------- | ------- | ---------------------------------- | ---------------------------------- |
| `project50.app` (apex) | `A`     | `76.76.21.21`                      | Vercel's apex anycast IP (Vercel shows the current value). |
| `project50.app` (apex) | `AAAA`  | _(value Vercel shows)_             | Add if your registrar supports IPv6 `AAAA`. |
| `www`                | `CNAME` | `cname.vercel-dns.com`             | Vercel's CNAME target.             |

> Use the values **Vercel displays for your project** — the apex IP above is the
> historically-published one but can change; the dashboard is authoritative.

### Option B — Cloudflare (DNS in front of the host)

Manage the zone in Cloudflare and point records at the origin host:

| Host    | Type    | Value                     | Proxy        |
| ------- | ------- | ------------------------- | ------------ |
| `@` (apex) | `CNAME` | `cname.vercel-dns.com`  | Proxied (orange cloud). Cloudflare **CNAME-flattens** the apex automatically. |
| `www`   | `CNAME` | `cname.vercel-dns.com`    | Proxied.     |

When Cloudflare is **proxied** (orange cloud), Cloudflare terminates TLS at its
edge and connects to the origin — set Cloudflare SSL mode to **Full (strict)**
so the origin cert is validated (Vercel serves a valid cert for the domain). If
you instead use **DNS-only** (grey cloud), Cloudflare is pure DNS and the host
provisions/serves the cert directly (behaves like Option A).

> Whichever option: after adding records, DNS propagation can take minutes to
> (rarely) hours. Verify with `dig project50.app +short` and
> `dig www.project50.app +short`.

---

## 3. TLS / HTTPS provisioning

Certificates are **managed and auto-renewing** — you do not hand-manage PEM
files.

- **Vercel (Option A / DNS-only Cloudflare):** once the domain's DNS resolves to
  Vercel, Vercel automatically issues a Let's Encrypt cert for both apex and
  `www` and renews it before expiry. Nothing to configure beyond adding the
  domain. The site is unreachable over https until the cert is issued (usually
  under a minute after DNS verifies).
- **Cloudflare (proxied, Option B):** Cloudflare issues an edge "Universal SSL"
  cert for the proxied hostnames automatically and renews it. Keep an origin cert
  on Vercel too and use **Full (strict)** so the Cloudflare→origin hop is also
  encrypted and validated.

There is **no app-side TLS config**: Next.js runs behind the host's TLS
terminator. The app only cares that the **public origin is https**, which it
learns from `AUTH_URL` (see §5).

---

## 4. www ↔ apex redirect (pick a canonical host)

Serve the site on **one** canonical origin and 301-redirect the other, so cookies
and OAuth callbacks have a single, stable origin. Decide apex-canonical
(`project50.app`) **or** www-canonical (`www.project50.app`) and be consistent —
this same host is what goes into `AUTH_URL` and the OAuth redirect URIs.

- **Vercel:** add both domains, then in **Domains** set one as the redirect to
  the other (Vercel offers a "Redirect to…" toggle, 308/301). Apex-canonical is
  the common choice for this app.
- **Cloudflare:** use a **Redirect Rule** / Bulk Redirect from `www` → apex (or
  vice-versa), `301`, preserving path and query.

> If you change which host is canonical later, you must also update `AUTH_URL`
> and every OAuth redirect URI (§5) — they must match the canonical origin
> exactly, scheme included.

---

## 5. App-specific wiring (do not skip)

Changing the public origin has four app-level consequences. All of these live in
env/config, not code changes.

### 5a. `AUTH_URL` / `NEXTAUTH_URL` → the https origin

Auth.js (NextAuth v5) builds its callback URLs from `AUTH_URL`, and this app
**also gates `Secure` cookies on it**:

```ts
// apps/web/lib/auth-config.ts
export function shouldUseSecureCookies(env = process.env): boolean | undefined {
  const url = env.AUTH_URL ?? env.NEXTAUTH_URL;
  return url?.startsWith("https://") ? true : undefined;
}
```

`auth.ts` passes `useSecureCookies: true` only when this returns `true`. So:

- **Set `AUTH_URL=https://<canonical-host>`** (e.g. `https://project50.app`) in
  the production environment — for Vercel, in **Project → Settings → Environment
  Variables (Production)**. `NEXTAUTH_URL` is accepted as a legacy fallback; set
  one or the other.
- It **must be `https://`**. If it is missing or `http://`, `shouldUseSecureCookies`
  returns `undefined`, the session cookie is **not** marked `Secure`, and
  (combined with HSTS / a proxied https edge) the browser may refuse to send it —
  users appear logged out immediately after signing in. This is the single most
  common custom-domain auth bug.
- It must match the **canonical** host from §4 exactly (no trailing slash). A
  mismatch (e.g. `AUTH_URL` on apex while users land on `www`) breaks the OAuth
  callback origin check.

See the `AUTH_URL` row in [SECRETS.md](./SECRETS.md) (it is plain config, not a
secret, but **must be updated on any domain change**).

### 5b. OAuth redirect URIs (Google + Facebook)

The app uses Google and Facebook providers (`apps/web/auth.ts`). Auth.js exposes
each provider's callback at:

```
https://<canonical-host>/api/auth/callback/google
https://<canonical-host>/api/auth/callback/facebook
```

Add these **exact** URLs to each provider console (**TODO: provider consoles**):

- **Google** — Cloud Console → APIs & Services → Credentials → your OAuth 2.0
  Client → **Authorized redirect URIs**: add
  `https://project50.app/api/auth/callback/google`. Also add the canonical
  origin under **Authorized JavaScript origins** if required. Keep any existing
  preview/`localhost` URIs if you still need them.
- **Facebook** — App Dashboard → **Facebook Login → Settings → Valid OAuth
  Redirect URIs**: add `https://project50.app/api/auth/callback/facebook`. Also
  add the domain under **App Domains** and ensure the app is in **Live** mode for
  public users.

If you support both apex and `www` during a transition, register both callback
URLs; otherwise register only the canonical one. The client IDs/secrets
(`GOOGLE_CLIENT_ID`, `FACEBOOK_CLIENT_ID`, …) are unchanged — only the redirect
URIs change. See [SECRETS.md](./SECRETS.md) for those env vars.

### 5c. CSP / `S3_PUBLIC_URL` / CDN host

`apps/web/middleware.ts` sends a Content-Security-Policy whose `img-src` /
`media-src` / `connect-src` include the **storage origin derived from
`S3_PUBLIC_URL` (falling back to `S3_ENDPOINT`)**. The same value drives
`next.config.mjs` `images.remotePatterns`. Therefore:

- If media is served from a CDN subhost of the new domain (e.g.
  `https://cdn.project50.app`), set **`S3_PUBLIC_URL=https://cdn.project50.app`**.
  The CSP and `remotePatterns` pick the host up automatically — no code edit. See
  [CDN.md](./CDN.md) for the full CDN setup.
- The app's own origin (`'self'`) in the CSP is relative, so moving the app to a
  new domain needs **no CSP change** for first-party content. Only the
  media/CDN host (a separate origin) must be reflected via `S3_PUBLIC_URL`.
- The OAuth `form-action` allowances (`accounts.google.com`, `www.facebook.com`)
  are provider hosts and are independent of your domain — leave them as-is.

### 5d. HSTS (already sent — https only)

`middleware.ts` already sends:

```
strict-transport-security: max-age=63072000; includeSubDomains; preload
```

No change is needed in code. Notes for go-live:

- HSTS is **only honored over https**. It has no effect until the domain serves a
  valid cert (§3), which is the normal end state here.
- `includeSubDomains` means **every** subdomain (including `cdn.project50.app`)
  must also be https-capable — which it is when fronted by the CDN/host. Make sure
  no subdomain needs plain http before relying on this.
- `preload` signals intent to be added to the browser HSTS preload list. Only
  **submit the apex to <https://hstspreload.org/>** once you are confident every
  subdomain is permanently https — preload removal is slow. Submission is a
  separate **TODO** and is optional; the header is harmless until then.

---

## 6. Verification checklist

After DNS resolves and the cert is issued:

- [ ] `https://project50.app` and `https://www.project50.app` both load over TLS
      (valid cert, no warning).
- [ ] The non-canonical host **301/308-redirects** to the canonical one (§4),
      path/query preserved.
- [ ] `http://project50.app` upgrades to https (host/Cloudflare "Always Use HTTPS"
      or the redirect handles it).
- [ ] **Sign in with Google** and **with Facebook** complete and land back on the
      app authenticated (validates 5a + 5b).
- [ ] After sign-in, the **session cookie is marked `Secure`** (DevTools →
      Application → Cookies). If not, re-check `AUTH_URL` is `https://…` (5a).
- [ ] Uploaded **images/media load** from the CDN host with no CSP violation in
      the console (validates 5c).
- [ ] Response headers include `strict-transport-security` and
      `content-security-policy` (validates 5d / middleware is running).

Quick header check:

```bash
curl -sI https://project50.app | grep -iE 'strict-transport-security|content-security-policy|location'
```

---

## Cross-references

- [DEPLOY.md](./DEPLOY.md) — Vercel project setup, env scopes, preview vs
  production deploys.
- [SECRETS.md](./SECRETS.md) — `AUTH_URL`, OAuth client IDs/secrets,
  `S3_PUBLIC_URL`, and where they live.
- [CDN.md](./CDN.md) — putting a CDN in front of media and wiring `S3_PUBLIC_URL`
  / `next.config.mjs` / the CSP.

## Open TODOs (manual, your accounts)

- [ ] **Registrar:** register the domain; decide registrar-DNS vs Cloudflare.
- [ ] **Host:** add apex + `www` to Vercel (or configure Cloudflare zone) and
      create the DNS records the dashboard specifies.
- [ ] **Redirect:** choose the canonical host and configure the www↔apex redirect.
- [ ] **Env:** set `AUTH_URL` (https, canonical) in production; update
      `S3_PUBLIC_URL` if media moves to a domain subhost.
- [ ] **OAuth consoles:** add the `/api/auth/callback/{google,facebook}` redirect
      URIs (and App Domains / JS origins) for the new domain.
- [ ] **HSTS preload (optional):** submit the apex once all subdomains are https.
