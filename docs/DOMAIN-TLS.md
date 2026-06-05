# Custom Domain, DNS & TLS

A runbook for putting the Project 50 **web app** (`apps/web`, a Next.js App
Router app) on its custom domain with HTTPS. The app runs on **Azure Container
Apps** (Canada Central) — see [`infra/azure/README.md`](../infra/azure/README.md)
and [DEPLOY.md](./DEPLOY.md).

The live domain is **`project50.fit`**, and the canonical, cert-bearing origin is
**`https://www.project50.fit`** (the `www` subdomain). The infra source of truth
for the custom-domain + TLS setup is **[`infra/azure/README.md`](../infra/azure/README.md)**
(§§ *Custom domain & TLS — managed outside Terraform*, *Apex domain → www*); this
runbook mirrors it and adds the app-side wiring.

This is an **end-to-end** procedure: the DNS/TLS plumbing **and** the app-specific
wiring that must change if the origin URL ever changes — auth callback URLs, the
`Secure`-cookie switch, OAuth provider config, the CSP, and HSTS. Skipping the
app-specific section produces a site that loads but silently breaks sign-in.

> **TODO (your accounts):** steps needing a registrar login (Namecheap), an Azure
> change, or an OAuth provider console are marked **TODO** — one-time manual steps,
> not code.

---

## TL;DR

1. **`www` is the single canonical origin**, fronted by an Azure-**managed** TLS
   cert (auto-renewed) bound to the Container App. DNS: a `www` `CNAME` → the app
   FQDN, plus the `asuid.www` `TXT` domain-verification record Azure requires.
2. The managed cert + custom-domain binding are **created and managed with `az`,
   NOT in Terraform** — azurerm 4.75 genuinely cannot represent them (see
   [Why TLS is managed outside Terraform](#why-tls-is-managed-outside-terraform-azurerm-475)).
   Azure auto-renews the cert, so there's no PEM toil.
3. The **apex `project50.fit` is NOT bound on the Container App.** Apex managed
   certs fail there (the HTTP→HTTPS redirect breaks the ACME challenge), so the
   apex is routed to `www` with a **registrar-level 301 redirect at Namecheap**.
   Apex binding / the missing redirect is tracked in **open issue
   [#291](https://github.com/tomqwu/project50/issues/291)**.
4. **Wire the app to the canonical https origin** (mostly already defaulted):
   - `AUTH_URL` defaults to `https://www.project50.fit` (the Terraform `auth_url`
     var) — what `shouldUseSecureCookies()` keys on for `Secure` cookies.
   - OAuth redirect URIs use `https://www.project50.fit/api/auth/callback/<provider>`.
5. **Verify** https, the apex→www redirect, sign-in, the `Secure` cookie, and HSTS.

There is **no CDN** and no `cdn.*` host — media is served via short-lived SAS URLs
straight from Blob storage (see [CDN.md](./CDN.md) / [OBJECT-STORAGE.md](./OBJECT-STORAGE.md)),
so no CDN subdomain or its CSP/cert wiring is involved.

---

## 1. The domain & canonical host

- Registered domain: **`project50.fit`** (registrar **Namecheap** — **TODO:
  registrar** for any record change).
- Canonical origin: **`https://www.project50.fit`**. `www` is the **only** host
  bound on the Container App and the **only** one that carries a managed cert.
- The apex `project50.fit` is **not** bound on the app; it 301-redirects to `www`
  at the registrar (§4).

Why `www`-canonical (not apex): apex managed certs don't provision on Container
Apps (§3 / §4), so making the apex canonical would mean no cert on the canonical
origin. `www` provisions cleanly, so it is the canonical, cert-bearing host.

---

## 2. DNS records (Namecheap)

Manage these on **Namecheap → Domain List → project50.fit → Manage** (**TODO:
registrar**). The live setup:

| Host        | Type    | Value                                                         | Purpose |
| ----------- | ------- | ------------------------------------------------------------- | ------- |
| `www`       | `CNAME` | the Container App FQDN (`ca-project50-web-dev.<env-region>.azurecontainerapps.io`) | Points `www` at the app. |
| `asuid.www` | `TXT`   | the domain-verification id Azure shows when you add the hostname | Azure custom-domain ownership validation for the `www` binding. |
| `@` (apex)  | URL **Redirect** | `https://www.project50.fit`, **Permanent (301)**, **unmasked** | Routes the apex to `www` at the registrar (§4) — no apex cert on the app. |

> Get the exact `www` CNAME target and the `asuid.www` TXT value from Azure when
> you add the hostname (`az containerapp hostname add` shows them) — don't guess.
> DNS propagation can take minutes; verify with `dig www.project50.fit +short`.

---

## 3. TLS / HTTPS — the `www` managed cert

The `www` cert is an Azure-**managed** TLS cert on the Container Apps
**environment** + a custom-domain **binding** of that cert to the app. Azure
**issues and auto-renews** it — no PEM handling.

Live ids (ops reference; subscription `81e891a1-b374-4898-8fed-0871de418dae`, RG
`rg-project50-dev-canadacentral`, env `cae-project50-dev`, app
`ca-project50-web-dev`):

| What | Live value |
| --- | --- |
| Managed cert name | `mc-cae-project50--www-project50-fi-5521` |
| Binding (custom domain) | `www.project50.fit` → `ca-project50-web-dev`, binding type `SniEnabled`, validation `CNAME` |

**Inspect the cert + binding (read-only):**

```bash
SUB=81e891a1-b374-4898-8fed-0871de418dae
RG=rg-project50-dev-canadacentral
ENV=cae-project50-dev
APP=ca-project50-web-dev
DOMAIN=www.project50.fit

# Managed cert (state should be Succeeded; subject = the domain)
az containerapp env certificate list -g "$RG" --name "$ENV" \
  --managed-certificates-only \
  --query "[?properties.subjectName=='$DOMAIN'].{name:name,state:properties.provisioningState,subject:properties.subjectName}" -o table

# The custom-domain binding on the app
az containerapp hostname list -g "$RG" --name "$APP" \
  --query "[?name=='$DOMAIN']" -o json
```

**(Re)create the binding with `az`** if it is ever lost (the `www` CNAME +
`asuid.www` TXT must be in place first; Azure then auto-provisions + auto-renews
the managed cert):

```bash
az containerapp hostname add  -g "$RG" --name "$APP" --hostname "$DOMAIN"
az containerapp hostname bind -g "$RG" --name "$APP" --hostname "$DOMAIN" \
  --environment "$ENV" --validation-method CNAME
# Azure provisions + SNI-binds the managed cert; verify with the list commands above.
```

There is **no app-side TLS config**: Next.js runs behind the Container Apps TLS
terminator. The app only needs the public origin to be https — which it learns
from `AUTH_URL` (§5).

### Why TLS is managed outside Terraform (azurerm 4.75)

The managed cert + binding are deliberately **not** in Terraform — a routine
`terraform apply -var image_tag=…` does not touch them and is unaffected (no new
vars, no resources to import). This is the documented outcome of #268, because
**azurerm 4.75 genuinely cannot represent these resources** — two hard blockers:

1. **The managed-cert name contains `--`.** Azure auto-generated
   `mc-cae-project50--www-project50-fi-5521`, with a **double hyphen**. The
   provider's `name` ValidateFunc for
   `azurerm_container_app_environment_managed_certificate` rejects any value
   containing `--` (`strings.Contains(v, "--")`), at **plan/validate** time — so
   the live cert simply cannot be declared without `terraform validate` erroring,
   even as an import.
2. **The binding can't reference a managed cert.**
   `azurerm_container_app_custom_domain`'s settable cert field parses as a
   `/certificates/...` environment-cert id, but a managed-cert binding references a
   `/managedCertificates/...` id (a different path) that the field does not accept;
   on Read the provider records the managed cert under a *computed* field, leaving
   the settable one empty. So a managed-cert binding can't be faithfully expressed.

Forcing these into Terraform would error `terraform validate`/plan and **break
routine deploys**, so they stay under `az` and are documented here +
[`infra/azure/README.md`](../infra/azure/README.md). **Revisit when** azurerm
relaxes the `--` rule **and** lets the custom domain bind a `/managedCertificates/...`
id (or the cert is reissued with a representable name).

---

## 4. Apex `project50.fit` → `www` (open issue #291)

**The apex is routed to `www` with a registrar-level 301 redirect at Namecheap —
do NOT bind the apex on the Container App.**

**Why not an apex managed cert:** apex managed certs **fail** on Container Apps.
Issuance uses an **HTTP ACME challenge** on `http://project50.fit/.well-known/...`,
but the app's ingress **redirects HTTP→HTTPS**, which breaks the challenge before
the CA can validate it. (Subdomains like `www` provision cleanly because the `www`
CNAME validation path isn't subject to the same apex redirect trap.) So there is
**no reliable apex managed cert**; adding fragile apex-cert Terraform would just
produce a perpetually-failing resource — deliberately omitted.

**Status — open issue [#291](https://github.com/tomqwu/project50/issues/291)
([MED] Apex project50.fit not bound — TLS reset, no apex→www redirect):** until the
registrar redirect below is in place, hitting the bare apex gives a **TLS reset**
and there is **no apex→www redirect**. The recommended fix is the Namecheap 301
redirect.

**Recommended path (registrar URL redirect at Namecheap)** — **TODO: registrar:**

1. Namecheap → **Domain List → project50.fit → Manage**.
2. Ensure the `www` host already points at the app (§2): the `www` `CNAME` → app
   FQDN, and the `asuid.www` `TXT` Azure required for the `www` binding.
3. Under **Redirect Domain**, add an **unmasked (301 permanent)** redirect:
   - **Source:** `@` (apex `project50.fit`) — optionally both `http://`/`https://`.
   - **Destination:** `https://www.project50.fit`
   - Type: **Permanent (301)**, **unmasked** (a real redirect, not a frame).
4. Save. Namecheap serves the apex over its own redirect endpoint, so the apex
   **never needs a cert on the Container App**. Verify:

   ```bash
   curl -sI http://project50.fit  | grep -i '^location:'   # → https://www.project50.fit
   curl -sI https://project50.fit | grep -i '^location:'   # → https://www.project50.fit
   ```

This keeps `www` as the single canonical, cert-bearing origin and routes the apex
to it at the registrar layer — no apex cert, no fragile apex Terraform.

---

## 5. App-specific wiring (do not skip)

Changing the public origin has app-level consequences. These live in env/config,
not code changes — and the prod defaults already point at the canonical origin.

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

- The Terraform **`auth_url` var defaults to `https://www.project50.fit`** (the
  canonical origin), so a routine `terraform apply -var image_tag=…` needs **no
  `-var auth_url=…` override** (passing it is harmless). `NEXTAUTH_URL` is a legacy
  fallback; set one or the other.
- It **must be `https://`**. If missing or `http://`, `shouldUseSecureCookies`
  returns `undefined`, the session cookie isn't marked `Secure`, and the browser
  may refuse to send it — users appear logged out right after signing in. This is
  the single most common custom-domain auth bug.
- It must match the **canonical** host (`www`) exactly, no trailing slash. A
  mismatch (e.g. `AUTH_URL` on apex while users land on `www`) breaks the OAuth
  callback origin check — which is also why the apex is a redirect, not a second
  served origin.

See the `AUTH_URL` row in [SECRETS.md](./SECRETS.md) (plain config, not a secret,
but **must be updated on any domain change**).

### 5b. OAuth redirect URIs (Facebook; Google when enabled)

The app's OAuth providers (`apps/web/auth.ts`) expose each callback at:

```
https://www.project50.fit/api/auth/callback/facebook
https://www.project50.fit/api/auth/callback/google   # when Google is enabled
```

Add the **exact** URL to each provider console (**TODO: provider consoles**):

- **Facebook** — App Dashboard → **Facebook Login → Settings → Valid OAuth
  Redirect URIs**: add `https://www.project50.fit/api/auth/callback/facebook`.
  Add `project50.fit` under **App Domains** and ensure the app is in **Live** mode.
  (Facebook credentials come from the `facebook-client-id`/`facebook-client-secret`
  Key Vault secrets — see [SECRETS.md](./SECRETS.md).)
- **Google** (if/when enabled) — Cloud Console → Credentials → your OAuth client →
  **Authorized redirect URIs**: add
  `https://www.project50.fit/api/auth/callback/google`, and the canonical origin
  under **Authorized JavaScript origins** if required.

Register only the **canonical** (`www`) callback — the apex is a redirect, never a
served callback origin. The client IDs/secrets are unchanged on a domain move;
only the redirect URIs change.

### 5c. CSP / media origin (no CDN host)

`apps/web/middleware.ts` sends a CSP whose `img-src` / `media-src` / `connect-src`
include the **storage origin** the app serves media from. In production that is
the **Azure Blob host** (`*.blob.core.windows.net`) reached via per-request SAS
URLs — **there is no CDN and no `cdn.*` subdomain** to allow-list. The app's own
origin (`'self'`) is relative, so moving the app's domain needs **no CSP change**
for first-party content. The S3/MinIO `S3_PUBLIC_URL` knob (which also drives the
CSP/`remotePatterns` when set) is **dev/fallback only** and unset in prod — see
[OBJECT-STORAGE.md](./OBJECT-STORAGE.md) / [CDN.md](./CDN.md). The OAuth
`form-action` allowances (`accounts.google.com`, `www.facebook.com`) are provider
hosts, independent of your domain — leave them as-is.

### 5d. HSTS (already sent — https only)

`middleware.ts` already sends:

```
strict-transport-security: max-age=63072000; includeSubDomains; preload
```

No code change needed. Notes for go-live:

- HSTS is **only honored over https**, so it has no effect until the cert is
  issued (§3) — the normal end state for `www`.
- `includeSubDomains` covers every subdomain of `project50.fit`. There is no
  `cdn.*` subdomain to worry about; ensure no subdomain needs plain http before
  relying on this.
- `preload` signals intent for the browser HSTS preload list. Only **submit the
  apex to <https://hstspreload.org/>** once you're confident every subdomain is
  permanently https (preload removal is slow). Optional; the header is harmless
  until then.

---

## 6. Verification checklist

After DNS resolves and the `www` cert is issued:

- [ ] `https://www.project50.fit` loads over TLS (valid managed cert, no warning).
- [ ] `http://project50.fit` and `https://project50.fit` **301-redirect** to
      `https://www.project50.fit` (the Namecheap apex redirect — §4 / #291).
- [ ] **Sign in with Facebook** (and Google if enabled) completes and lands back
      authenticated (validates 5a + 5b).
- [ ] After sign-in, the **session cookie is marked `Secure`** (DevTools →
      Application → Cookies). If not, re-check `AUTH_URL` is `https://…` (5a).
- [ ] Uploaded **images/media load** from the Blob SAS URLs with no CSP violation
      in the console (validates 5c).
- [ ] Response headers include `strict-transport-security` and
      `content-security-policy` (validates 5d / middleware is running).

Quick header check:

```bash
curl -sI https://www.project50.fit | grep -iE 'strict-transport-security|content-security-policy|location'
```

---

## Cross-references

- [`infra/azure/README.md`](../infra/azure/README.md) — the managed cert/binding
  + apex-redirect source of truth, and the deploy runbook.
- [DEPLOY.md](./DEPLOY.md) — Azure Container Apps deploy (local, gated), env, image build.
- [SECRETS.md](./SECRETS.md) — `AUTH_URL`, the Facebook OAuth Key Vault secrets.
- [CDN.md](./CDN.md) / [OBJECT-STORAGE.md](./OBJECT-STORAGE.md) — media is SAS-served
  from Blob (no CDN, no `cdn.*` host).

## Open TODOs (manual, your accounts)

- [ ] **Registrar (Namecheap):** add the apex `@` → `https://www.project50.fit`
      **301 unmasked** redirect (open issue [#291](https://github.com/tomqwu/project50/issues/291));
      keep the `www` CNAME + `asuid.www` TXT in place.
- [ ] **OAuth consoles:** ensure the `www` `/api/auth/callback/{facebook,google}`
      redirect URIs (+ App Domains / JS origins) are registered.
- [ ] **HSTS preload (optional):** submit the apex once all hosts are https.
