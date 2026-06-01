# project50 Phase 2 — Auth + API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add authentication (Google + Facebook OAuth via Auth.js, plus a test-only sign-in path) and the core API: challenges, activities (with server-side completion/milestone recomputation using `packages/core`), follows, feed, and reactions — all covered by integration tests against a real Postgres test DB to the hard 99% gate, plus a Playwright e2e journey.

**Architecture:**
- Auth.js (NextAuth v5) in `apps/web` with **JWT sessions** and a `signIn` callback that upserts our own `User` + `Identity` (no Prisma adapter — we own the schema). A **test-only Credentials provider**, gated by `AUTH_E2E=1`, lets e2e/integration sign in deterministically as a seeded user; it is never enabled in production.
- API = Next.js Route Handlers. A thin `apps/web/lib/api/*` service layer does Prisma queries and calls pure `@project50/core` for completion/streak/milestone logic. Handlers parse → authorize → validate (core) → persist (prisma) → respond with typed JSON.
- **Testing:** handler/service **integration tests** run in the Node (not jsdom) environment against the CI/local Postgres, truncating tables between tests. This gives honest coverage of real query + logic paths. Pure rules stay unit-tested in `core` (Phase 1).

**Tech Stack:** Auth.js v5 (`next-auth`), Next.js 15 route handlers, Prisma, Vitest (node-env integration tests), Playwright. Builds on Phases 0–1.

> **Library-version note (do FIRST, Task 1):** Auth.js v5 is evolving. Before writing auth code, the implementer must confirm the installed `next-auth` v5 App-Router API (the `NextAuth({...})` factory returning `{ handlers, auth, signIn, signOut }`, provider import paths, and the `route.ts` `export const { GET, POST } = handlers`). Pin an exact working version in package.json. If the API differs from this plan's snippets, adapt the snippets to the real API and note the deltas — do not force outdated code.

---

## File structure (Phase 2)

```
apps/web/auth.ts                         NextAuth config (providers + callbacks)
apps/web/app/api/auth/[...nextauth]/route.ts   Auth.js handler
apps/web/lib/session.ts                  requireUser(): current user id or 401
apps/web/lib/api/challenges.ts           create/list/get challenge services (+ tests)
apps/web/lib/api/activities.ts           logActivity service: validate+create+recompute (+ tests)
apps/web/lib/api/social.ts               follow/unfollow/feed/react services (+ tests)
apps/web/app/api/challenges/route.ts            POST create, GET mine
apps/web/app/api/challenges/[id]/route.ts       GET one (with day statuses + streak)
apps/web/app/api/challenges/[id]/activities/route.ts  POST log activity
apps/web/app/api/feed/route.ts                  GET following feed
apps/web/app/api/users/[id]/follow/route.ts     POST follow, DELETE unfollow
apps/web/app/api/activities/[id]/reactions/route.ts   POST react
apps/web/test/db.ts                      integration test harness (prisma + truncate + seed)
apps/web/e2e/journey.spec.ts             e2e: sign in (test mode) → create → log → see
```

---

### Task 1: Auth.js setup + session helper

**Files:** `apps/web/auth.ts`, `apps/web/app/api/auth/[...nextauth]/route.ts`, `apps/web/lib/session.ts`, deps in `apps/web/package.json`; tests `apps/web/lib/session.test.ts`, `apps/web/auth.test.ts`.

- [ ] **Step 1: Install + pin Auth.js**

Run `pnpm --filter @project50/web add next-auth@beta` (Auth.js v5). Then PIN the resolved exact version in `apps/web/package.json` (replace `^`/`beta` tag with the concrete version that installed). Verify the App-Router API shape (see the library-version note above) by reading `node_modules/next-auth`'s exports or docs; adapt the snippets below if needed.

- [ ] **Step 2: Auth config (`apps/web/auth.ts`)**

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@project50/db";

const providers = [
  Google({ allowDangerousEmailAccountLinking: true }),
  Facebook({ allowDangerousEmailAccountLinking: true }),
];

// Test-only deterministic sign-in. NEVER enabled in production.
if (process.env.AUTH_E2E === "1") {
  providers.push(
    Credentials({
      id: "e2e",
      name: "E2E",
      credentials: { handle: {} },
      authorize: async (creds) => {
        const handle = String(creds?.handle ?? "e2e-user");
        const user = await prisma.user.upsert({
          where: { handle },
          update: {},
          create: { handle, displayName: handle },
        });
        return { id: user.id, name: user.displayName };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    // Upsert our User + Identity for OAuth sign-ins (credentials path already created the user).
    async signIn({ user, account }) {
      if (!account || account.provider === "e2e") return true;
      const provider = account.provider === "google" ? "GOOGLE" : "FACEBOOK";
      const handleBase = (user.email ?? user.name ?? account.providerAccountId).split("@")[0];
      const dbUser = await prisma.user.upsert({
        where: { handle: handleBase },
        update: { displayName: user.name ?? handleBase, avatarUrl: user.image ?? undefined },
        create: { handle: handleBase, displayName: user.name ?? handleBase, avatarUrl: user.image ?? undefined },
      });
      await prisma.identity.upsert({
        where: { provider_providerAccountId: { provider, providerAccountId: account.providerAccountId } },
        update: {},
        create: { userId: dbUser.id, provider, providerAccountId: account.providerAccountId },
      });
      user.id = dbUser.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
});
```

- [ ] **Step 3: Route handler** `apps/web/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```
(Add the `@/*` path alias to `apps/web/tsconfig.json` `compilerOptions.paths` if not present: `"@/*": ["./*"]`, with `baseUrl: "."`.)

- [ ] **Step 4: Session helper** `apps/web/lib/session.ts`:
```ts
import { auth } from "@/auth";

export class UnauthorizedError extends Error {}

/** Returns the authenticated user id, or throws UnauthorizedError. */
export async function requireUser(): Promise<string> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new UnauthorizedError("unauthenticated");
  return id;
}
```

- [ ] **Step 5: Tests** — integration test of the credentials sign-in path + a unit test of `requireUser` (mock `@/auth`'s `auth`). Write `apps/web/lib/session.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { requireUser, UnauthorizedError } from "./session";

describe("requireUser", () => {
  it("returns the user id when authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    await expect(requireUser()).resolves.toBe("u1");
  });
  it("throws when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("throws when session lacks a user id", async () => {
    vi.mocked(auth).mockResolvedValue({ user: {} } as never);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
```
Add env vars to `.env.example`: `AUTH_E2E`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` (placeholders). Coverage: `auth.ts` callback logic is covered by the DB integration tests added in Task 2/3 (sign-in path) — if any branch remains uncovered at the end, add a targeted integration test; do NOT exclude `auth.ts`.

- [ ] **Step 6:** `pnpm --filter @project50/web test`, `typecheck`, root `lint` green. Commit `feat(web): auth.js (google/facebook + e2e provider) + session helper`.

---

### Task 2: Integration test harness

**Files:** `apps/web/test/db.ts`, `apps/web/vitest.config.ts` (extend coverage include to `lib/**` and `auth.ts`).

- [ ] **Step 1:** Create `apps/web/test/db.ts` exposing the shared `prisma`, a `resetDb()` that `TRUNCATE`s all domain tables (RESTART IDENTITY CASCADE), and seed helpers `createUser()`, `createChallenge()`. Integration test files start with `// @vitest-environment node` and call `beforeEach(resetDb)`.
- [ ] **Step 2:** Update `apps/web/vitest.config.ts` coverage `include` to `["app/**/*.{ts,tsx}", "lib/**/*.ts", "auth.ts"]` so handlers/services/auth are gated. Load `DATABASE_URL` for tests (vitest `setupFiles` reading `.env`, or rely on CI env). Ensure jsdom stays default but node-env files opt in via the docblock.
- [ ] **Step 3:** A smoke integration test proving `resetDb()` + a seed works against the DB. Run green (requires `docker compose up -d postgres` + migrations applied locally; CI already does `prisma migrate deploy`). Commit `test(web): postgres integration harness`.

---

### Task 3: Challenges API (create / list / get)

- [ ] Service `apps/web/lib/api/challenges.ts`: `createChallenge(ownerId, input)`, `listChallenges(ownerId)`, `getChallenge(id, viewerId)` (respects visibility; returns dayStatuses + `currentStreak`/`longestStreak` via `@project50/core`).
- [ ] Route handlers `app/api/challenges/route.ts` (POST create, GET mine — `requireUser`, 401 on throw) and `app/api/challenges/[id]/route.ts` (GET; 404 when private/missing for non-owner).
- [ ] Integration tests covering: create persists; list returns only owner's; get includes streaks; visibility 404. Validate input (title required, goalType ∈ enum, TARGET requires dailyTarget>0). Commit `feat(web): challenges API`.

### Task 4: Activities API (log)

- [ ] Service `apps/web/lib/api/activities.ts`: `logActivity(userId, challengeId, input)` → `validateActivityInput` (core) → on errors return 422 with the error codes; else create `Activity`, recompute that day's activities → `computeDayCompletion` (core) → upsert `DayStatus`, recompute completed-count + `currentStreak` → `evaluateMilestones` (core) → upsert any newly-earned `Milestone`s.
- [ ] Handler `app/api/challenges/[id]/activities/route.ts` POST.
- [ ] Integration tests: valid TARGET log accumulates and flips DayStatus.completed at target; BINARY done completes; invalid (future/negative/mood) → 422 with codes; milestone earned at 7 completed days. Commit `feat(web): activity logging with completion + milestone recompute`.

### Task 5: Follow + Feed API

- [ ] Service `apps/web/lib/api/social.ts`: `follow(followerId, followeeId)`, `unfollow(...)`, `feed(viewerId)` (recent activities from followees, respecting challenge visibility).
- [ ] Handlers `app/api/users/[id]/follow/route.ts` (POST/DELETE), `app/api/feed/route.ts` (GET).
- [ ] Integration tests: follow creates edge (idempotent), unfollow removes, feed returns followees' visible activities newest-first, excludes private. Commit `feat(web): follow + feed API`.

### Task 6: Reactions API

- [ ] In `social.ts`: `react(userId, activityId, kind, text?)` (CHEER or COMMENT; COMMENT requires text).
- [ ] Handler `app/api/activities/[id]/reactions/route.ts` POST.
- [ ] Integration tests: cheer creates; comment requires text (422 without); reactions listed with activity. Commit `feat(web): reactions API`.

### Task 7: e2e journey + green + PR/auto-merge

- [ ] `apps/web/e2e/journey.spec.ts`: with `AUTH_E2E=1`, sign in via the e2e credentials provider (POST to the credentials callback / a tiny test sign-in page), create a challenge through the API/UI, log an activity, and assert it appears. Playwright `webServer` command sets `AUTH_E2E=1` and `AUTH_SECRET`. Keep the existing home/health specs green.
- [ ] Full `pnpm test` (≥99% incl. lib/** + auth.ts), `typecheck`, `lint` green.
- [ ] Update README Phase 2 → done. Commit, push, open PR; auto-merge on green CI (CI runs migrate deploy so integration tests have a DB).

---

## Self-Review (completed)

- **Spec coverage:** Implements spec §3 auth (Google/Facebook OAuth), §4 persistence wiring, §5 flows (create/log/feed/celebrate-data/react), §6 error handling (401 unauth, 404 visibility, 422 validation). Uses Phase 1 core for all rule logic (no duplication).
- **Placeholder scan:** Tasks 1–2 carry full code; Tasks 3–6 specify exact services, routes, and test cases (contracts + assertions) following the established pattern — detailed code is written per-task during execution. No "TBD".
- **Type consistency:** `requireUser`/`UnauthorizedError` (Task 1) used by all handlers; services consume core types (`CompletionRule`, `ChallengeWindow`, `MilestoneKind`) from Phase 1; visibility/goal enums match the Prisma schema.
- **Risk:** Auth.js v5 API drift — mitigated by the version-pinning/verification step in Task 1. Integration tests need Postgres — present locally (docker) and in CI (service + migrate deploy).
