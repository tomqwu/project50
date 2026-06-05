import { prisma } from "@project50/db";
import {
  localDayKey,
  dayNumber,
  addDays,
  safeTimeZone,
  PROJECT50_RULE_IDS,
  PROJECT50_LENGTH_DAYS,
} from "@project50/core";
import { presignGet, deleteObject, userMediaPrefix } from "@/lib/storage";

/** One photo attached to a Project 50 day, with a signed view URL for display. */
export interface Project50DayMediaItem {
  /** Stable row id, used to remove this specific photo. */
  id: string;
  objectKey: string;
  width: number;
  height: number;
  /** Short-lived signed GET URL for the object (mirrors withMediaUrls). */
  url: string;
}

export interface Project50Today {
  dayKey: string;
  dayNumber: number;
  checks: boolean[]; // length 7, index = ruleId - 1
  completedCount: number;
  /** Photos attached to today, oldest first, each with a signed view URL. */
  media: Project50DayMediaItem[];
  /** Today's journal reflection (rule #7), present only once the user saves one. */
  journal?: { wins: string; lessons: string };
}

export type Project50DayStatus = "complete" | "incomplete" | "today" | "future";

export interface Project50HistoryDay {
  dayNumber: number;
  dayKey: string;
  status: Project50DayStatus;
}

export interface Project50History {
  days: Project50HistoryDay[];
}

export interface Project50State {
  status: "NONE" | "ACTIVE" | "FAILED" | "COMPLETED";
  runId?: string;
  /** Public shareId of the active run, for building per-day share links. */
  shareId?: string;
  today?: Project50Today;
  history?: Project50History;
  failedDayNumber?: number;
  failedRuleId?: number;
  completedDays?: number;
}

/** The active Project 50 run for a user, or null. */
export async function activeRun(uid: string) {
  return prisma.challenge.findFirst({
    where: { ownerId: uid, kind: "PROJECT50", status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

/** The most recent Project 50 run for a user (any status), or null. */
async function latestCompletedRun(uid: string) {
  return prisma.challenge.findFirst({
    where: { ownerId: uid, kind: "PROJECT50", status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });
}

/** Create a new Project 50 run starting today (in `timezone`). Returns the run id. */
export async function startProject50(
  uid: string,
  timezone: string,
  now: Date = new Date(),
): Promise<string> {
  // Normalize a blank/invalid zone to UTC before persisting, so the stored
  // value is always a zone every later consumer (localDayKey/localHour) can use.
  const safeTz = safeTimeZone(timezone);
  const startDate = localDayKey(now, safeTz);
  const run = await prisma.challenge.create({
    data: {
      ownerId: uid,
      title: "Project 50",
      goalType: "BINARY",
      startDate,
      timezone: safeTz,
      lengthDays: 50,
      kind: "PROJECT50",
      status: "ACTIVE",
    },
  });
  return run.id;
}

/** Build today's checklist for a run. */
async function buildToday(
  runId: string,
  startDate: string,
  todayKey: string,
): Promise<Project50Today> {
  const checksRows = await prisma.ruleCheck.findMany({
    where: { challengeId: runId, dayKey: todayKey, done: true },
  });
  const doneIds = new Set(checksRows.map((c) => c.ruleId));
  const checks = PROJECT50_RULE_IDS.map((id) => doneIds.has(id));
  const media = await listProject50DayMedia(runId, todayKey);
  const journalRow = await prisma.dayJournal.findUnique({
    where: { challengeId_dayKey: { challengeId: runId, dayKey: todayKey } },
    select: { wins: true, lessons: true },
  });
  return {
    dayKey: todayKey,
    dayNumber: Math.max(1, dayNumber(startDate, todayKey)),
    checks,
    completedCount: checks.filter(Boolean).length,
    media,
    ...(journalRow ? { journal: { wins: journalRow.wins, lessons: journalRow.lessons } } : {}),
  };
}

/**
 * List the photos attached to one day of a run, oldest first, each with a
 * short-lived signed GET URL for display (mirrors lib/api/media withMediaUrls).
 */
export async function listProject50DayMedia(
  runId: string,
  dayKey: string,
): Promise<Project50DayMediaItem[]> {
  const rows = await prisma.project50DayMedia.findMany({
    where: { challengeId: runId, dayKey },
    orderBy: { createdAt: "asc" },
    select: { id: true, objectKey: true, width: true, height: true },
  });
  return Promise.all(rows.map(async (m) => ({ ...m, url: await presignGet(m.objectKey) })));
}

/**
 * Build the 50-day calendar for a run: one entry per Day 1..50.
 * `status` is "today" for the current local day, "future" for days after today,
 * "complete" if that day's DayStatus is completed, otherwise "incomplete".
 */
async function buildHistory(
  runId: string,
  startDate: string,
  todayKey: string,
): Promise<Project50History> {
  const lastKey = addDays(startDate, PROJECT50_LENGTH_DAYS - 1);
  const completedRows = await prisma.dayStatus.findMany({
    where: { challengeId: runId, completed: true, dayKey: { gte: startDate, lte: lastKey } },
    select: { dayKey: true },
  });
  const completedKeys = new Set(completedRows.map((r) => r.dayKey));

  const days: Project50HistoryDay[] = [];
  for (let i = 0; i < PROJECT50_LENGTH_DAYS; i++) {
    const dayKey = addDays(startDate, i);
    let status: Project50DayStatus;
    if (dayKey === todayKey) {
      status = "today";
    } else if (dayKey > todayKey) {
      status = "future";
    } else if (completedKeys.has(dayKey)) {
      status = "complete";
    } else {
      status = "incomplete";
    }
    days.push({ dayNumber: i + 1, dayKey, status });
  }
  return { days };
}

/**
 * Read-only 50-day progress calendar for the user's active Project 50 run.
 * Returns an empty list when there is no active run.
 */
export async function getProject50History(
  uid: string,
  now: Date = new Date(),
): Promise<Project50History> {
  const run = await activeRun(uid);
  if (!run) return { days: [] };
  const todayKey = localDayKey(now, run.timezone);
  return buildHistory(run.id, run.startDate, todayKey);
}

export async function getProject50State(
  uid: string,
  now: Date = new Date(),
): Promise<Project50State> {
  const run = await activeRun(uid);
  if (!run) {
    // A previously-finished run stays visible as a terminal celebration.
    const done = await latestCompletedRun(uid);
    if (done) return { status: "COMPLETED", runId: done.id, completedDays: PROJECT50_LENGTH_DAYS };
    return { status: "NONE" };
  }

  const todayKey = localDayKey(now, run.timezone);

  // Hard reset: any elapsed past day (startDate .. yesterday) that is not 7/7 fails the run.
  // Collapse the old per-day findUnique N+1 (up to ~49 serial round-trips on the
  // dashboard's hottest path) into a SINGLE bulk read of completed days over the
  // window (mirrors buildHistory), then find the first elapsed-incomplete day in
  // memory. Semantics are identical: the run fails on the first elapsed past day
  // (startDate..yesterday) whose DayStatus is not completed.
  const yesterdayKey = addDays(todayKey, -1);
  const completedRows = await prisma.dayStatus.findMany({
    where: {
      challengeId: run.id,
      completed: true,
      dayKey: { gte: run.startDate, lte: yesterdayKey },
    },
    select: { dayKey: true },
  });
  const completedKeys = new Set(completedRows.map((r) => r.dayKey));

  for (let d = run.startDate; d <= yesterdayKey; d = addDays(d, 1)) {
    if (!completedKeys.has(d)) {
      await prisma.challenge.update({ where: { id: run.id }, data: { status: "FAILED" } });
      const doneRows = await prisma.ruleCheck.findMany({
        where: { challengeId: run.id, dayKey: d, done: true },
      });
      const doneIds = new Set(doneRows.map((r) => r.ruleId));
      const failedRuleId = PROJECT50_RULE_IDS.find((id) => !doneIds.has(id));
      return {
        status: "FAILED",
        runId: run.id,
        failedDayNumber: Math.max(1, dayNumber(run.startDate, d)),
        failedRuleId,
      };
    }
  }

  // Completion: the whole program window has elapsed (we are past Day 50) and the
  // hard-reset loop above confirmed every elapsed day 1..50 was 7/7. Mark terminal.
  if (dayNumber(run.startDate, todayKey) > PROJECT50_LENGTH_DAYS) {
    await prisma.challenge.update({ where: { id: run.id }, data: { status: "COMPLETED" } });
    return { status: "COMPLETED", runId: run.id, completedDays: PROJECT50_LENGTH_DAYS };
  }

  return {
    status: "ACTIVE",
    runId: run.id,
    // Only surface the shareId for a PUBLIC run. The public per-day page loads
    // via getChallengeByShareId, which returns null for PRIVATE/FOLLOWERS — so
    // exposing the id on a non-public run would render share buttons whose links
    // 404. Omit it instead, and ShareDayButton won't render.
    shareId: run.visibility === "PUBLIC" ? run.shareId : undefined,
    today: await buildToday(run.id, run.startDate, todayKey),
    history: await buildHistory(run.id, run.startDate, todayKey),
  };
}

/** Set a rule's done state for TODAY on the user's active run; recompute DayStatus. */
export async function toggleRule(
  uid: string,
  ruleId: number,
  done: boolean,
  now: Date = new Date(),
): Promise<void> {
  const run = await activeRun(uid);
  if (!run) throw new Error("No active Project 50 run");
  const todayKey = localDayKey(now, run.timezone);

  await prisma.ruleCheck.upsert({
    where: {
      challengeId_dayKey_ruleId: { challengeId: run.id, dayKey: todayKey, ruleId },
    },
    update: { done },
    create: { challengeId: run.id, dayKey: todayKey, ruleId, done },
  });

  const doneCount = await prisma.ruleCheck.count({
    where: { challengeId: run.id, dayKey: todayKey, done: true },
  });
  const completed = doneCount === PROJECT50_RULE_IDS.length;

  await prisma.dayStatus.upsert({
    where: { challengeId_dayKey: { challengeId: run.id, dayKey: todayKey } },
    update: { completed },
    create: { challengeId: run.id, dayKey: todayKey, completed },
  });
}

/**
 * Attach a photo to TODAY on the user's active Project 50 run.
 *
 * Resolves the active run (throws if none, like toggleRule), then writes one
 * Project50DayMedia row keyed to the run's local dayKey. Multiple photos per day
 * are allowed, so this always inserts a new row. The objectKey must already
 * point at an uploaded image (the client presigns + PUTs before calling this).
 */
export async function attachProject50DayMedia(
  uid: string,
  media: { objectKey: string; width: number; height: number },
  now: Date = new Date(),
): Promise<void> {
  const run = await activeRun(uid);
  if (!run) throw new Error("No active Project 50 run");
  const todayKey = localDayKey(now, run.timezone);
  await prisma.project50DayMedia.create({
    data: {
      challengeId: run.id,
      dayKey: todayKey,
      objectKey: media.objectKey,
      width: media.width,
      height: media.height,
    },
  });
}

/**
 * Remove one photo (by media id) from the user's Project 50 run.
 *
 * SECURITY: the row is loaded JOINED to its challenge and we verify the
 * challenge's `ownerId === uid` before touching anything. A user may only ever
 * delete THEIR OWN media — a mismatch (or an unknown id) is a safe no-op, so no
 * cross-user deletion is possible.
 *
 * ORDER — delete-row, THEN recheck refs, THEN delete-blob (avoids a TOCTOU
 * orphan): we delete the DB row FIRST, then count remaining references to its
 * objectKey, then delete the blob only if none remain. Doing the ref-count
 * before the row delete would let two concurrent removals of rows sharing one
 * objectKey each see the other's row, both decide "still referenced," both
 * delete their row, and leave the blob orphaned forever. Deleting the row first
 * means whichever removal checks last sees 0 references and erases the blob — so
 * "remove photo" actually erases the user's media (GDPR intent), no orphan.
 *
 * SECURITY (defense-in-depth): the stored objectKey is whatever the client
 * supplied at attach time, so a user could attach a row on THEIR OWN run whose
 * objectKey points at someone else's blob. Mirroring account deletion, we only
 * ever call deleteObject for keys under THIS user's own `media/<uid>/` prefix —
 * a row whose key is out-of-prefix has its DB row removed but no blob deleted.
 *
 * SHARED BLOBS: the same `media/<uid>/` blob can be referenced by MORE than the
 * one row being removed — another Project 50 day's photo (the same image
 * attached to multiple days), a general Activity photo (ActivityMedia), or a
 * rendered recap video (Recap) can all point at the same objectKey. We only
 * delete the blob when NO reference remains across ALL of those media tables
 * (checked AFTER this row is deleted); otherwise we'd orphan a still-live
 * thumbnail/video.
 *
 * BIAS: when in doubt we RETAIN the blob. A wrongly-deleted blob breaks a live
 * image; a wrongly-retained one is merely orphaned, and the GDPR account-
 * deletion prefix sweep (deleteUserMedia) removes orphans under `media/<uid>/`.
 * deleteObject is idempotent on a missing blob, so if two concurrent removals
 * both see 0 refs and both call it, the second is a harmless no-op.
 */
export async function removeProject50DayMedia(
  uid: string,
  mediaId: string,
): Promise<void> {
  const row = await prisma.project50DayMedia.findUnique({
    where: { id: mediaId },
    select: { id: true, objectKey: true, challenge: { select: { ownerId: true } } },
  });
  // Unknown id, or a row whose challenge is owned by someone else → no-op.
  // OWNERSHIP CHECK stays BEFORE any delete — no cross-user deletion is possible.
  if (!row || row.challenge.ownerId !== uid) return;
  const { objectKey } = row;

  // 1) Delete the DB row FIRST (idempotent: deleteMany no-ops if a concurrent
  //    removal already deleted it, instead of a P2025 throw).
  await prisma.project50DayMedia.deleteMany({ where: { id: row.id } });

  // 2) THEN count remaining references to this objectKey across every table that
  //    stores one (Project 50 day photos, activity photos, recaps). The row is
  //    already gone, so no exclusion is needed — any remaining reference means
  //    another view still shows this blob and it must NOT be deleted.
  const [dayMediaRefs, activityRefs, recapRefs] = await Promise.all([
    prisma.project50DayMedia.count({ where: { objectKey } }),
    prisma.activityMedia.count({ where: { objectKey } }),
    prisma.recap.count({ where: { objectKey } }),
  ]);
  const stillReferenced = dayMediaRefs + activityRefs + recapRefs > 0;

  // 3) Delete the blob only if nothing references it anymore AND it is under the
  //    user's own media prefix (never touch another user's / an arbitrary key).
  if (stillReferenced) {
    // Keep the blob: another row still uses it.
  } else if (objectKey.startsWith(userMediaPrefix(uid))) {
    try {
      await deleteObject(objectKey);
    } catch (err) {
      // Log and continue: the blob may be orphaned, but the DB row is already
      // gone so the user's "Today's photo" strip reflects the deletion.
      console.error(`removeProject50DayMedia: failed to delete blob ${objectKey}`, err);
    }
  } else {
    console.warn(
      `removeProject50DayMedia: skipping out-of-prefix media key ${objectKey} for ${uid}`,
    );
  }
}
