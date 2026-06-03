# Deployment (CD)

Continuous deployment for the **web app** (`apps/web`, a Next.js app) plus
automatic database migrations on release.

This document covers issues:

- **#17** — CD: deploy web to production host with preview deploys per PR.
- **#21** — Run DB migrations automatically on release (`prisma migrate deploy`).

## TL;DR

| Trigger                | Workflow                          | What happens                                            |
| ---------------------- | --------------------------------- | ------------------------------------------------------- |
| Pull request opened/updated | `.github/workflows/preview.yml` | Builds a Vercel **preview** deploy, comments the URL on the PR. |
| CI passes on `main`    | `.github/workflows/deploy.yml`    | Runs `prisma migrate deploy`, then deploys **production**. |
| Manual (Actions tab)   | `.github/workflows/deploy.yml`    | Same as above (`workflow_dispatch`).                    |

**The pipeline is inert until secrets are configured.** Without secrets every
deploy job is _skipped_ (not failed), so CI stays green on this repo and on
forks. Nothing deploys until you complete the manual setup below.

The default production host is **Vercel**. The `migrate` job is host-agnostic;
only the `deploy`/`preview` jobs are Vercel-specific. To use a different host,
replace the `deploy`/`preview` jobs and keep `migrate` as-is.

## Required secrets

Add these under **Settings → Secrets and variables → Actions** (repository
secrets) on GitHub.

| Secret              | Used by            | Description                                                            |
| ------------------- | ------------------ | --------------------------------------------------------------------- |
| `DATABASE_URL`      | `migrate` (#21)    | Postgres connection string for the **production** database.           |
| `VERCEL_TOKEN`      | `deploy`, `preview`| Vercel access token (Account → Settings → Tokens).                    |
| `VERCEL_ORG_ID`     | `deploy`, `preview`| Vercel organization/team id.                                          |
| `VERCEL_PROJECT_ID` | `deploy`, `preview`| Vercel project id for the web app.                                    |

`GITHUB_TOKEN` is provided automatically by GitHub Actions and is used to
comment the preview URL on PRs — you do not need to create it.

> Secret presence is detected by a small `preflight` job in each workflow. If a
> required secret is empty the dependent job is skipped with a `::notice::`,
> never a failure.

## How migrate-on-release works (#21)

`deploy.yml` runs two jobs, strictly ordered:

1. **`migrate`** — checks out the repo, installs deps, runs
   `pnpm --filter @project50/db exec prisma generate`, then
   `pnpm --filter @project50/db exec prisma migrate deploy` against the
   production `DATABASE_URL`. `migrate deploy` only applies **pending**
   migrations and is a no-op when the schema is already up to date, so re-runs
   are safe.
2. **`deploy`** — `needs: [preflight, migrate]`. It only proceeds when `migrate`
   did **not** fail or get cancelled. This guarantees new application code never
   serves traffic against an un-migrated schema.

Ordering rationale: migrations are run **before** the app is promoted to
production. Write migrations to be backward-compatible (expand → migrate →
contract) so the previous app version keeps working during the brief window
between migrate and deploy.

## How preview deploys work (#17)

`preview.yml` runs on every `pull_request` (opened / synchronize / reopened):

- Builds a **preview** Vercel deployment (no `--prod`), producing a unique URL
  per commit.
- Comments the preview URL back on the PR (`github-comment: true`).
- `concurrency` cancels superseded builds when new commits are pushed.
- Preview deploys **do not run migrations**. Point the Vercel project's preview
  environment at a disposable/preview database — never production.

> Forked PRs do not receive repository secrets from GitHub. In that case the
> `preflight` gate resolves to `false` and the preview job is cleanly skipped.

## Manual setup steps (one-time, done by you)

1. **Create the Vercel project**
   - Import this repo in Vercel.
   - Set the project **Root Directory** to `apps/web`.
   - Framework preset: **Next.js**.
   - Configure environment variables in Vercel (Production + Preview scopes):
     `DATABASE_URL`, `AUTH_SECRET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`,
     `S3_SECRET_KEY`, `S3_BUCKET`, and any others from `.env.example`. These are
     the app's **runtime/build** env on Vercel and are separate from the GitHub
     Actions secrets above (which are used by the `migrate` job and to authorize
     the deploy).
2. **Get the Vercel ids/token**
   - `VERCEL_TOKEN`: Vercel → Account Settings → Tokens → Create.
   - `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`: run `npx vercel link` in the repo
     and read them from the generated `.vercel/project.json`, or copy them from
     the project's settings page.
3. **Add the GitHub Actions secrets** listed in [Required secrets](#required-secrets).
4. **Provision the production database** and set its connection string as the
   `DATABASE_URL` GitHub secret (used by the `migrate` job). Use a separate
   preview database for the Vercel Preview environment.
5. Push to `main` (or run the **Deploy** workflow manually) to trigger the first
   production deploy.

## Rollback

- **App rollback (Vercel):** open the Vercel project → **Deployments**, find the
  last known-good production deployment, and choose **Promote to Production** (or
  `vercel rollback`). This is instant and does not touch the database.
- **Database rollback:** `prisma migrate deploy` only rolls **forward**. There is
  no automatic down-migration. To revert a schema change, author a new
  forward migration that undoes it and ship it through the same pipeline. This is
  why migrations should be backward-compatible (expand/contract) — a forward-only
  history means you can always roll the app back without a matching DB rollback.
- **Bad migration:** if a migration fails, the `migrate` job fails and the
  `deploy` job is skipped (no bad code reaches production). Fix the migration and
  re-run.

## Switching hosts

The `migrate` job is portable. To deploy somewhere other than Vercel:

1. Replace the `deploy` job in `deploy.yml` and the `preview` job in
   `preview.yml` with your host's deploy action/CLI.
2. Update the `preflight` secret gate to check whatever secrets your host needs.
3. Keep the `deploy` job's `needs: [preflight, migrate]` ordering so migrations
   still run first.
