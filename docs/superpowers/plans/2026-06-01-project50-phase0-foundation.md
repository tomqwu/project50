# project50 Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the project50 TypeScript monorepo with tooling, a local Postgres+MinIO dev environment, and a CI pipeline that enforces the hard 99% line+branch coverage gate and runs Playwright e2e — all proven green on a trivial vertical slice.

**Architecture:** pnpm-workspace monorepo. `packages/core` holds pure framework-free domain logic (the testable heart); `apps/web` is a Next.js App Router PWA whose API is route handlers; `packages/db` wraps Prisma/Postgres; `packages/config` holds shared tooling config. Phase 0 builds the skeleton + the test/CI machinery, not real features.

**Tech Stack:** Node 20, pnpm 9, TypeScript 5, Next.js 15 (App Router), React 18, Vitest 2 (v8 coverage), Playwright 1.4x, Prisma 5 + PostgreSQL 16, MinIO (S3-compatible), GitHub Actions. Repo: `github.com/tomqwu/project50`.

---

## File Structure (created in this phase)

```
.nvmrc                       Node version pin
package.json                 Root scripts + devDeps, "packageManager"
pnpm-workspace.yaml          Workspace globs
tsconfig.base.json           Shared compiler options
.prettierrc.json             Formatting
.eslintrc.cjs                Lint config (extends packages/config)
vitest.workspace.ts          Vitest workspace (runs all package suites)
docker-compose.yml           Postgres 16 + MinIO for local dev
.env.example                 Documented env vars
packages/config/             Shared tsconfig/eslint/vitest base + coverage policy
packages/core/               Pure domain logic (Phase 0: one sample fn + test)
packages/db/                 Prisma schema (Phase 0: empty datasource + client export)
apps/web/                    Next.js app (Phase 0: home page + /api/health + tests)
apps/web/e2e/                Playwright specs + config
.github/workflows/ci.yml     install → lint → typecheck → unit+coverage → build → e2e
docs/coverage-exclusions.md  The justified exclusion list (audited, not hidden)
```

---

### Task 1: Initialize the pnpm workspace root

**Files:**
- Create: `.nvmrc`
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Pin Node**

Create `.nvmrc`:
```
20
```

- [ ] **Step 2: Declare workspace globs**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Root package.json with scripts**

Create `package.json`:
```json
{
  "name": "project50",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc -b --pretty",
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "build": "pnpm -r --filter ./apps/web build",
    "test:e2e": "pnpm --filter @project50/web exec playwright test",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^8.57.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Shared base tsconfig**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 5: Install and commit**

Run: `pnpm install`
Expected: lockfile created, no errors.
```bash
git add .nvmrc pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace root"
```

---

### Task 2: Shared tooling config package

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/eslint-preset.cjs`
- Create: `packages/config/vitest.base.ts`
- Create: `.eslintrc.cjs`
- Create: `.prettierrc.json`
- Create: `docs/coverage-exclusions.md`

- [ ] **Step 1: config package manifest**

Create `packages/config/package.json`:
```json
{
  "name": "@project50/config",
  "version": "0.0.0",
  "private": true,
  "main": "eslint-preset.cjs",
  "exports": {
    "./eslint": "./eslint-preset.cjs",
    "./vitest": "./vitest.base.ts"
  }
}
```

- [ ] **Step 2: ESLint preset**

Create `packages/config/eslint-preset.cjs`:
```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  env: { node: true, es2022: true },
  ignorePatterns: ["dist", ".next", "node_modules", "**/*.generated.*"],
};
```

- [ ] **Step 3: Shared Vitest base with the 99% gate**

Create `packages/config/vitest.base.ts`:
```ts
import { defineConfig } from "vitest/config";

// The hard coverage gate. Exclusions are listed (and justified in
// docs/coverage-exclusions.md) — never widened silently to pass.
export const coverageThresholds = {
  lines: 99,
  branches: 99,
  functions: 99,
  statements: 99,
};

export const sharedCoverageExclude = [
  "**/*.config.*",
  "**/*.generated.*",
  "**/dist/**",
  "**/.next/**",
  "**/node_modules/**",
  "**/*.d.ts",
];

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: coverageThresholds,
      exclude: sharedCoverageExclude,
    },
  },
});
```

- [ ] **Step 4: Root ESLint + Prettier**

Create `.eslintrc.cjs`:
```js
module.exports = require("@project50/config/eslint");
```
Create `.prettierrc.json`:
```json
{ "singleQuote": false, "semi": true, "trailingComma": "all", "printWidth": 100 }
```

- [ ] **Step 5: Document the exclusion policy**

Create `docs/coverage-exclusions.md`:
```markdown
# Coverage Exclusions (audited)

Hard gate: 99% lines/branches/functions/statements across the repo.
Only files that cannot or should not carry unit coverage are excluded — each with a reason.
Adding to this list is a reviewed decision, not a way to pass the gate.

| Pattern | Reason |
|---|---|
| `**/*.config.*` | Build/tool config, no runtime logic to test. |
| `**/*.generated.*` | Generated code (e.g. Prisma client) — owned by the generator. |
| `**/dist/**`, `**/.next/**` | Build output. |
| `**/*.d.ts` | Type declarations only. |

We do NOT pad coverage with assertion-free tests. If a real file is hard to cover,
we refactor it to be testable rather than exclude it.
```

- [ ] **Step 6: Install deps for lint and commit**

Run: `pnpm add -Dw @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier`
Run: `pnpm install`
Expected: success.
```bash
git add packages/config .eslintrc.cjs .prettierrc.json docs/coverage-exclusions.md package.json pnpm-lock.yaml
git commit -m "chore: shared tooling config + coverage policy"
```

---

### Task 3: packages/core skeleton — prove the unit+coverage gate (TDD)

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Test:   `packages/core/src/version.test.ts`
- Create: `packages/core/src/version.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: core package manifest**

Create `packages/core/package.json`:
```json
{
  "name": "@project50/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run --coverage" }
}
```

- [ ] **Step 2: core tsconfig**

Create `packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: core vitest config (inherits the gate)**

Create `packages/core/vitest.config.ts`:
```ts
import base from "@project50/config/vitest";
export default base;
```

- [ ] **Step 4: Write the failing test**

Create `packages/core/src/version.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { coreVersion } from "./version";

describe("coreVersion", () => {
  it("returns the semantic version string", () => {
    expect(coreVersion()).toBe("0.0.0");
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @project50/core test`
Expected: FAIL — cannot find module `./version`.

- [ ] **Step 6: Minimal implementation**

Create `packages/core/src/version.ts`:
```ts
export function coreVersion(): string {
  return "0.0.0";
}
```
Create `packages/core/src/index.ts`:
```ts
export { coreVersion } from "./version";
```

- [ ] **Step 7: Run test + coverage to verify pass and 99% gate**

Run: `pnpm --filter @project50/core test`
Expected: PASS, coverage 100% on `src`, gate satisfied (no threshold error).

- [ ] **Step 8: Commit**
```bash
git add packages/core
git commit -m "feat(core): package skeleton with passing coverage gate"
```

---

### Task 4: packages/db — Prisma client wired to Postgres

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Create: `.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: db package manifest**

Create `packages/db/package.json`:
```json
{
  "name": "@project50/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "generate": "prisma generate",
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy"
  },
  "dependencies": { "@prisma/client": "^5.18.0" },
  "devDependencies": { "prisma": "^5.18.0" }
}
```

- [ ] **Step 2: Minimal Prisma schema**

Create `packages/db/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Phase 0: a sentinel model proving migrations + client generation work.
// Real domain models arrive in Phase 1.
model HealthCheck {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
}
```

- [ ] **Step 3: Client singleton**

Create `packages/db/src/client.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```
Create `packages/db/src/index.ts`:
```ts
export { prisma } from "./client";
```

- [ ] **Step 4: Dev env files**

Create `.env.example`:
```
DATABASE_URL="postgresql://project50:project50@localhost:5432/project50?schema=public"
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="project50-media"
AUTH_SECRET="dev-secret-change-me"
```
Create `docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: project50
      POSTGRES_PASSWORD: project50
      POSTGRES_DB: project50
    ports: ["5432:5432"]
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]
```

- [ ] **Step 5: Generate client + verify migration locally**

Run: `cp .env.example .env`
Run: `docker compose up -d postgres`
Run: `pnpm --filter @project50/db exec prisma migrate dev --name init`
Expected: migration created under `packages/db/prisma/migrations`, client generated, no errors.

- [ ] **Step 6: Commit**
```bash
git add packages/db .env.example docker-compose.yml pnpm-lock.yaml
git commit -m "feat(db): prisma client + postgres/minio dev env"
```

---

### Task 5: apps/web — Next.js app with health route + tests (TDD)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Test:   `apps/web/app/api/health/route.test.ts`
- Create: `apps/web/app/api/health/route.ts`

- [ ] **Step 1: web manifest**

Create `apps/web/package.json`:
```json
{
  "name": "@project50/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@project50/core": "workspace:*",
    "@project50/db": "workspace:*",
    "next": "^15.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Next config + tsconfig**

Create `apps/web/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
export default { reactStrictMode: true };
```
Create `apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "preserve", "plugins": [{ "name": "next" }], "noEmit": true },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "e2e"]
}
```

- [ ] **Step 3: web vitest config (jsdom + the gate)**

Create `apps/web/vitest.config.ts`:
```ts
import { defineConfig, mergeConfig } from "vitest/config";
import base from "@project50/config/vitest";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      environment: "jsdom",
      exclude: ["e2e/**", "node_modules/**"],
    },
  }),
);
```

- [ ] **Step 4: Root layout + home page**

Create `apps/web/app/layout.tsx`:
```tsx
export const metadata = { title: "project50", description: "50-day challenges" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "#121013", color: "#F2F0EC", margin: 0 }}>{children}</body>
    </html>
  );
}
```
Create `apps/web/app/page.tsx`:
```tsx
import { coreVersion } from "@project50/core";

export default function HomePage() {
  return <main data-testid="home">project50 v{coreVersion()}</main>;
}
```

- [ ] **Step 5: Write the failing health-route test**

Create `apps/web/app/api/health/route.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @project50/web test`
Expected: FAIL — cannot find `./route`.

- [ ] **Step 7: Implement the health route**

Create `apps/web/app/api/health/route.ts`:
```ts
export function GET() {
  return Response.json({ status: "ok" });
}
```

- [ ] **Step 8: Run test + coverage to verify pass**

Run: `pnpm --filter @project50/web test`
Expected: PASS, gate satisfied.

- [ ] **Step 9: Verify the app builds**

Run: `pnpm --filter @project50/web build`
Expected: Next build succeeds.

- [ ] **Step 10: Commit**
```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): next.js app with health route + unit tests"
```

---

### Task 6: Playwright e2e against the running app

**Files:**
- Create: `apps/web/playwright.config.ts`
- Test:   `apps/web/e2e/home.spec.ts`

- [ ] **Step 1: Playwright config (boots the dev server)**

Create `apps/web/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm build && pnpm start -p 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Write the e2e spec**

Create `apps/web/e2e/home.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("home page renders the app name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home")).toContainText("project50");
});

test("health endpoint returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ status: "ok" });
});
```

- [ ] **Step 3: Install browsers + run e2e**

Run: `pnpm --filter @project50/web exec playwright install --with-deps chromium`
Run: `pnpm test:e2e`
Expected: 2 passed.

- [ ] **Step 4: Commit**
```bash
git add apps/web/playwright.config.ts apps/web/e2e pnpm-lock.yaml
git commit -m "test(web): playwright e2e for home + health"
```

---

### Task 7: Vitest workspace + root green run

**Files:**
- Create: `vitest.workspace.ts`

- [ ] **Step 1: Aggregate package suites**

Create `vitest.workspace.ts`:
```ts
export default ["packages/core", "apps/web"];
```

- [ ] **Step 2: Run the whole unit suite with coverage**

Run: `pnpm test`
Expected: all suites pass; combined coverage ≥ 99%; no threshold failure.

- [ ] **Step 3: Run lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: no errors, no warnings.

- [ ] **Step 4: Commit**
```bash
git add vitest.workspace.ts
git commit -m "test: vitest workspace aggregating package suites"
```

---

### Task 8: GitHub Actions CI with the coverage + e2e gates

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: {}
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: project50
          POSTGRES_PASSWORD: project50
          POSTGRES_DB: project50
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://project50:project50@localhost:5432/project50?schema=public
      AUTH_SECRET: ci-secret
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @project50/db exec prisma generate
      - run: pnpm --filter @project50/db exec prisma migrate deploy
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test            # unit + 99% coverage gate
      - run: pnpm --filter @project50/web exec playwright install --with-deps chromium
      - run: pnpm test:e2e
```

- [ ] **Step 2: Push a branch and open a PR to prove CI is green**
```bash
git checkout -b chore/phase0-foundation
git push -u origin chore/phase0-foundation
gh pr create --fill --title "Phase 0: foundation + CI + 99% coverage gate"
```
Expected: PR opens; CI runs all jobs green.

- [ ] **Step 3: Confirm CI status**

Run: `gh pr checks --watch`
Expected: all checks pass. Do not merge until reviewed.

---

## Self-Review (completed)

- **Spec coverage:** Phase 0 implements the spec's testing/CI machinery (§7), the monorepo
  architecture skeleton (§3), and the dev environment for Postgres/MinIO media (§3). Domain
  model (§4), flows (§5), auth (§3 auth), and sharing are intentionally deferred to Phases 1–4
  and are NOT claimed here.
- **Placeholder scan:** No TBD/TODO; every code/command step shows real content.
- **Type consistency:** `coreVersion()` defined in Task 3 is the same symbol imported in
  Task 5; `@project50/*` package names are consistent across manifests; `GET` route signature
  matches its test.

## Process for execution
- Execute via **subagent-driven development**: one fresh sub-agent per task, TDD, two-stage
  review between tasks. Independent tasks (e.g. Tasks 3 and 4) may run in parallel sub-agents.
- After the first PR exists (Task 8), set up the **issue/PR monitor** (scheduled/looping agent)
  to report open issues, PR review/merge state, CI result, and coverage vs the 99% gate.

## Roadmap (subsequent phases — each gets its own plan written just-in-time)
- **Phase 1 — Core domain + schema:** User/Challenge/Activity/DayStatus/Reaction/Milestone
  models; pure streak/completion/badge logic with exhaustive tests.
- **Phase 2 — Auth + API:** Auth.js Google/Facebook; route handlers for challenges, activities,
  follows, reactions, with mocked-OAuth e2e.
- **Phase 3 — Web UI:** Momentum design system in `packages/ui`; dashboard, log-activity,
  feed, celebrate screens.
- **Phase 4 — Sharing + PWA + journeys:** image-card generation, public pages, PWA manifest/SW,
  full Playwright journeys; drive total coverage to the 99% gate.
