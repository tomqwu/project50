import { prisma } from "@project50/db";
import {
  validateActivityInput,
  computeDayCompletion,
  currentStreak,
  evaluateMilestones,
  type ActivityInput,
} from "@project50/core";
import { notFound, unprocessable, HttpError } from "./http";

export interface MediaInput {
  objectKey: string;
  width: number;
  height: number;
}

export async function logActivity(
  userId: string,
  challengeId: string,
  input: ActivityInput & { activityType?: string; note?: string; media?: MediaInput[] },
  asOf: string,
) {
  // 1. Load challenge (404 if missing)
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge) notFound("CHALLENGE_NOT_FOUND");

  // 2. Authorize: only owner may log
  if (challenge.ownerId !== userId) {
    throw new HttpError(403, "FORBIDDEN");
  }

  // 3. Validate activity input using core
  const errors = validateActivityInput(
    {
      goalType: challenge.goalType,
      startDate: challenge.startDate,
      lengthDays: challenge.lengthDays,
    },
    input,
    asOf,
  );
  if (errors.length > 0) {
    unprocessable("INVALID_ACTIVITY", errors);
  }

  // 4. Create the Activity
  const activity = await prisma.activity.create({
    data: {
      challengeId,
      userId,
      dayKey: input.dayKey,
      activityType: input.activityType,
      amount: input.amount,
      done: input.done ?? false,
      note: input.note,
      mood: input.mood,
    },
  });

  // 4b. Attach media (if any)
  if (input.media && input.media.length > 0) {
    const expectedPrefix = `media/${userId}/`;
    for (const m of input.media) {
      if (!m.objectKey.startsWith(expectedPrefix)) {
        unprocessable("INVALID_MEDIA_KEY");
      }
    }
    await prisma.activityMedia.createMany({
      data: input.media.map((m, idx) => ({
        activityId: activity.id,
        objectKey: m.objectKey,
        width: m.width,
        height: m.height,
        order: idx,
      })),
    });
  }

  // 5. Recompute that day's DayStatus
  const dayActivities = await prisma.activity.findMany({
    where: { challengeId, dayKey: input.dayKey },
  });

  const completion = computeDayCompletion(
    {
      goalType: challenge.goalType,
      dailyTarget: challenge.dailyTarget === null ? undefined : challenge.dailyTarget,
    },
    dayActivities.map((a) => ({
      amount: a.amount === null ? undefined : a.amount,
      done: a.done,
    })),
  );

  const dayStatus = await prisma.dayStatus.upsert({
    where: { challengeId_dayKey: { challengeId, dayKey: input.dayKey } },
    update: { totalAmount: completion.totalAmount, completed: completion.completed },
    create: {
      challengeId,
      dayKey: input.dayKey,
      totalAmount: completion.totalAmount,
      completed: completion.completed,
    },
  });

  // 6. Recompute milestones
  const allDayStatuses = await prisma.dayStatus.findMany({
    where: { challengeId, completed: true },
  });

  const completedDayKeys = allDayStatuses.map((ds) => ds.dayKey);
  const completedCount = completedDayKeys.length;
  const streak = currentStreak(completedDayKeys, input.dayKey);

  const earnedKinds = evaluateMilestones({ completedCount, currentStreak: streak });

  const newMilestones = [];
  for (const kind of earnedKinds) {
    const milestone = await prisma.milestone.upsert({
      where: { challengeId_kind: { challengeId, kind } },
      update: {},
      create: { challengeId, kind },
    });
    newMilestones.push(milestone);
  }

  return { activity, dayStatus, newMilestones };
}
