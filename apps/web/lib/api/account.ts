import { prisma } from "@project50/db";
import { notFound, unprocessable } from "./http";
import { deleteObject, deleteUserMedia, userMediaPrefix } from "@/lib/storage";

/** Account fields a user can view/edit. */
export interface Account {
  handle: string;
  displayName: string;
}

/** Allowed characters/length for a handle: 3–30 of [a-z0-9_], case-insensitive. */
const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/i;

/** Return the user's editable account fields. Throws 404 if no such user. */
export async function getAccount(uid: string): Promise<Account> {
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { handle: true, displayName: true },
  });
  if (!user) notFound("ACCOUNT_NOT_FOUND");
  return { handle: user.handle, displayName: user.displayName };
}

/**
 * Update the user's profile. Both fields are optional; provided values are
 * trimmed. A provided handle must be non-empty, match {@link HANDLE_PATTERN},
 * and not be taken by a different user. A provided displayName must be
 * non-empty after trimming. Returns the resulting { handle, displayName }.
 */
export async function updateAccount(
  uid: string,
  input: { displayName?: string; handle?: string },
): Promise<Account> {
  const data: { displayName?: string; handle?: string } = {};

  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim();
    if (displayName === "") unprocessable("invalid_display_name");
    data.displayName = displayName;
  }

  if (input.handle !== undefined) {
    const handle = input.handle.trim();
    if (!HANDLE_PATTERN.test(handle)) unprocessable("invalid_handle");

    const existing = await prisma.user.findUnique({
      where: { handle },
      select: { id: true },
    });
    if (existing && existing.id !== uid) unprocessable("handle_taken");

    data.handle = handle;
  }

  if (Object.keys(data).length === 0) {
    return getAccount(uid);
  }

  const updated = await prisma.user.update({
    where: { id: uid },
    data,
    select: { handle: true, displayName: true },
  });
  return { handle: updated.handle, displayName: updated.displayName };
}

/**
 * A machine-readable snapshot of everything tied to a user, for GDPR data
 * portability. The exact field set mirrors the Prisma relations on `User`.
 */
export interface AccountExport {
  exportedAt: string;
  profile: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    isAdmin: boolean;
    createdAt: string;
  };
  challenges: Array<{
    id: string;
    title: string;
    goalType: string;
    unit: string | null;
    dailyTarget: number | null;
    startDate: string;
    timezone: string;
    lengthDays: number;
    kind: string;
    status: string;
    visibility: string;
    shareId: string;
    createdAt: string;
    activities: Array<{
      id: string;
      dayKey: string;
      activityType: string | null;
      amount: number | null;
      done: boolean;
      note: string | null;
      mood: number | null;
      createdAt: string;
    }>;
    dayStatuses: Array<{
      dayKey: string;
      totalAmount: number;
      completed: boolean;
    }>;
    milestones: Array<{ kind: string; earnedAt: string }>;
    recaps: Array<{ id: string; kind: string; createdAt: string }>;
    ruleChecks: Array<{
      id: string;
      dayKey: string;
      ruleId: number;
      done: boolean;
      createdAt: string;
    }>;
  }>;
  activities: Array<{
    id: string;
    challengeId: string;
    dayKey: string;
    activityType: string | null;
    amount: number | null;
    done: boolean;
    note: string | null;
    mood: number | null;
    createdAt: string;
  }>;
  reactions: Array<{
    id: string;
    activityId: string;
    kind: string;
    text: string | null;
    createdAt: string;
  }>;
  following: Array<{ followeeId: string; createdAt: string }>;
  followers: Array<{ followerId: string; createdAt: string }>;
}

/**
 * Assemble a complete, machine-readable export of the signed-in user's personal
 * data (GDPR data portability). Includes their profile plus every record tied
 * to them: their challenges (with each challenge's activities, day statuses,
 * milestones, recaps, and rule checks), their first-party activities and
 * reactions, and their follow edges in both directions. Only data belonging to
 * this user is returned — other users' records are never included. Dates are
 * serialized to ISO strings. Throws 404 if no such user exists.
 */
export async function exportAccountData(uid: string): Promise<AccountExport> {
  const user = await prisma.user.findUnique({
    where: { id: uid },
    include: {
      challenges: {
        orderBy: { createdAt: "asc" },
        include: {
          activities: { orderBy: { createdAt: "asc" } },
          dayStatuses: { orderBy: { dayKey: "asc" } },
          milestones: { orderBy: { earnedAt: "asc" } },
          recaps: { orderBy: { createdAt: "asc" } },
          ruleChecks: { orderBy: { createdAt: "asc" } },
        },
      },
      activities: { orderBy: { createdAt: "asc" } },
      reactions: { orderBy: { createdAt: "asc" } },
      following: { orderBy: { createdAt: "asc" } },
      followers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!user) notFound("ACCOUNT_NOT_FOUND");

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
    },
    challenges: user.challenges.map((c) => ({
      id: c.id,
      title: c.title,
      goalType: c.goalType,
      unit: c.unit,
      dailyTarget: c.dailyTarget,
      startDate: c.startDate,
      timezone: c.timezone,
      lengthDays: c.lengthDays,
      kind: c.kind,
      status: c.status,
      visibility: c.visibility,
      shareId: c.shareId,
      createdAt: c.createdAt.toISOString(),
      activities: c.activities.map((a) => ({
        id: a.id,
        dayKey: a.dayKey,
        activityType: a.activityType,
        amount: a.amount,
        done: a.done,
        note: a.note,
        mood: a.mood,
        createdAt: a.createdAt.toISOString(),
      })),
      dayStatuses: c.dayStatuses.map((d) => ({
        dayKey: d.dayKey,
        totalAmount: d.totalAmount,
        completed: d.completed,
      })),
      milestones: c.milestones.map((m) => ({
        kind: m.kind,
        earnedAt: m.earnedAt.toISOString(),
      })),
      recaps: c.recaps.map((r) => ({
        id: r.id,
        kind: r.kind,
        createdAt: r.createdAt.toISOString(),
      })),
      ruleChecks: c.ruleChecks.map((rc) => ({
        id: rc.id,
        dayKey: rc.dayKey,
        ruleId: rc.ruleId,
        done: rc.done,
        createdAt: rc.createdAt.toISOString(),
      })),
    })),
    activities: user.activities.map((a) => ({
      id: a.id,
      challengeId: a.challengeId,
      dayKey: a.dayKey,
      activityType: a.activityType,
      amount: a.amount,
      done: a.done,
      note: a.note,
      mood: a.mood,
      createdAt: a.createdAt.toISOString(),
    })),
    reactions: user.reactions.map((r) => ({
      id: r.id,
      activityId: r.activityId,
      kind: r.kind,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
    })),
    following: user.following.map((f) => ({
      followeeId: f.followeeId,
      createdAt: f.createdAt.toISOString(),
    })),
    followers: user.followers.map((f) => ({
      followerId: f.followerId,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

/**
 * Collect every object-storage key for media the user has uploaded: per-day
 * Project 50 photos, activity photos, and rendered recap videos. All live under
 * the user's `media/<userId>/` prefix, but we resolve the exact keys from the DB
 * so we can delete them explicitly before the cascade removes the rows.
 */
async function collectUserMediaKeys(uid: string): Promise<string[]> {
  const [dayMedia, activityMedia, recaps] = await Promise.all([
    prisma.project50DayMedia.findMany({
      where: { challenge: { ownerId: uid } },
      select: { objectKey: true },
    }),
    prisma.activityMedia.findMany({
      where: { activity: { userId: uid } },
      select: { objectKey: true },
    }),
    prisma.recap.findMany({
      where: { challenge: { ownerId: uid } },
      select: { objectKey: true },
    }),
  ]);

  const keys = new Set<string>();
  for (const m of dayMedia) keys.add(m.objectKey);
  for (const m of activityMedia) keys.add(m.objectKey);
  for (const r of recaps) keys.add(r.objectKey);
  return [...keys];
}

/**
 * Permanently delete the user and all of their data. Prisma relations declare
 * `onDelete: Cascade`, so deleting the User row cascades to their identities,
 * challenges (and each challenge's activities, media, day statuses, milestones,
 * recaps, rule checks, reactions), first-party activities/reactions, and follow
 * edges in both directions. Throws if no such user exists.
 *
 * The DB cascade leaves no orphaned rows, but it does NOT touch object storage,
 * so we ALSO delete the user's uploaded media blobs (GDPR erasure): first the
 * exact objectKeys recorded in the DB, then a belt-and-suspenders sweep of the
 * whole `media/<userId>/` prefix to catch anything the DB no longer references.
 *
 * Resilience: media deletion runs BEFORE the DB delete and never aborts it. A
 * single blob delete that throws (e.g. transient storage error) is logged and
 * skipped; the prefix sweep and the DB delete still proceed, so account
 * deletion always completes. If storage is unconfigured/unreachable the sweep
 * is a safe no-op (or logs and continues).
 */
export async function deleteAccount(uid: string): Promise<void> {
  // Resolve the exact keys from the DB while the rows still exist. A failure
  // here means the DB is unreadable, so we let it propagate (the user.delete
  // below would fail anyway) rather than erase blobs against a broken DB.
  const keys = await collectUserMediaKeys(uid);

  // SECURITY: only ever delete blobs under THIS user's own media prefix. Some
  // objectKeys are persisted as-supplied (e.g. attachProject50DayMedia), so a
  // crafted/buggy row could carry a key pointing at another user's media or an
  // arbitrary bucket path. Skip anything outside media/<uid>/; the prefix sweep
  // below still removes all of the user's legitimate media regardless.
  const prefix = userMediaPrefix(uid);

  // Delete each known blob; log + continue so one failure can't block erasure.
  for (const key of keys) {
    if (!key.startsWith(prefix)) {
      console.warn(
        `deleteAccount: skipping out-of-prefix media key ${key} for ${uid}`,
      );
      continue;
    }
    try {
      await deleteObject(key);
    } catch (err) {
      console.error(`deleteAccount: failed to delete media blob ${key}`, err);
    }
  }

  // Belt-and-suspenders: sweep the user's whole media prefix for orphans.
  try {
    await deleteUserMedia(uid);
  } catch (err) {
    console.error(`deleteAccount: media prefix sweep failed for ${uid}`, err);
  }

  // Finally remove the DB row (cascades all child rows). Throws if no such user.
  await prisma.user.delete({ where: { id: uid } });
}
