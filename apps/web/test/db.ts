// @vitest-environment node
/**
 * Integration test harness: shared prisma client, DB reset, and seed helpers.
 * Import from integration tests that opt into node env.
 */
export { prisma } from "@project50/db";
import { prisma } from "@project50/db";

/**
 * Truncate all domain tables in dependency order (CASCADE handles FKs).
 * Also resets the user counter so handles are predictable per test.
 * Call in beforeEach() in every integration test file.
 */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "User","Identity","Follow","Block","Report","Challenge","Activity","ActivityMedia","DayStatus","Reaction","Milestone","Recap","RuleCheck","Subscription","Referral","MagicLinkToken" RESTART IDENTITY CASCADE;`,
  );
  _userCounter = 0;
}

let _userCounter = 0;

/**
 * Create a User with a unique handle.
 * Pass `handle` to control the name; otherwise a counter-based default is used.
 */
export async function createUser(
  overrides: {
    handle?: string;
    displayName?: string;
    avatarUrl?: string;
    isAdmin?: boolean;
  } = {},
) {
  _userCounter += 1;
  const handle = overrides.handle ?? `user${_userCounter}`;
  return prisma.user.create({
    data: {
      handle,
      displayName: overrides.displayName ?? handle,
      avatarUrl: overrides.avatarUrl,
      isAdmin: overrides.isAdmin ?? false,
    },
  });
}

/**
 * Create a Challenge owned by `ownerId`.
 * Defaults: goalType TARGET, dailyTarget 60, startDate "2026-06-01",
 * lengthDays 50, timezone "UTC", visibility PUBLIC, title "Test".
 */
export async function createChallenge(
  ownerId: string,
  overrides: {
    title?: string;
    goalType?: "TARGET" | "BINARY";
    dailyTarget?: number;
    startDate?: string;
    lengthDays?: number;
    timezone?: string;
    visibility?: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
  } = {},
) {
  const goalType = overrides.goalType ?? "TARGET";
  return prisma.challenge.create({
    data: {
      ownerId,
      title: overrides.title ?? "Test",
      goalType,
      dailyTarget: overrides.dailyTarget ?? (goalType === "TARGET" ? 60 : null),
      startDate: overrides.startDate ?? "2026-06-01",
      lengthDays: overrides.lengthDays ?? 50,
      timezone: overrides.timezone ?? "UTC",
      visibility: overrides.visibility ?? "PUBLIC",
    },
  });
}
