import { prisma } from "@project50/db";
import { currentStreak, longestStreak } from "@project50/core";
import { notFound, unprocessable } from "./http";

export interface CreateChallengeInput {
  title: string;
  goalType: string;
  dailyTarget?: number;
  unit?: string;
  startDate: string;
  lengthDays?: number;
  timezone?: string;
  visibility?: string;
}

function validateCreateInput(input: CreateChallengeInput): string[] {
  const errors: string[] = [];
  if (!input.title || input.title.trim() === "") {
    errors.push("title is required");
  }
  if (!["TARGET", "BINARY"].includes(input.goalType)) {
    errors.push("goalType must be TARGET or BINARY");
  }
  if (input.goalType === "TARGET") {
    if (input.dailyTarget === undefined || input.dailyTarget <= 0) {
      errors.push("dailyTarget must be > 0 for TARGET challenges");
    }
    if (!input.unit || input.unit.trim() === "") {
      errors.push("unit is required for TARGET challenges");
    }
  }
  return errors;
}

export async function createChallenge(
  ownerId: string,
  input: CreateChallengeInput,
) {
  const errors = validateCreateInput(input);
  if (errors.length > 0) {
    unprocessable("INVALID_CHALLENGE", errors);
  }

  return prisma.challenge.create({
    data: {
      ownerId,
      title: input.title.trim(),
      goalType: input.goalType as "TARGET" | "BINARY",
      dailyTarget: input.goalType === "TARGET" ? input.dailyTarget : undefined,
      unit: input.goalType === "TARGET" ? input.unit : undefined,
      startDate: input.startDate,
      lengthDays: input.lengthDays ?? 50,
      timezone: input.timezone ?? "UTC",
      visibility: (input.visibility as "PUBLIC" | "FOLLOWERS" | "PRIVATE") ?? "PUBLIC",
    },
  });
}

export async function listChallenges(ownerId: string) {
  return prisma.challenge.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getChallenge(id: string, viewerId: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: { dayStatuses: true },
  });

  if (!challenge) notFound("CHALLENGE_NOT_FOUND");

  // Enforce visibility
  if (challenge.visibility === "PRIVATE") {
    if (challenge.ownerId !== viewerId) notFound("CHALLENGE_NOT_FOUND");
  } else if (challenge.visibility === "FOLLOWERS") {
    if (challenge.ownerId !== viewerId) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followeeId: {
            followerId: viewerId,
            followeeId: challenge.ownerId,
          },
        },
      });
      if (!follow) notFound("CHALLENGE_NOT_FOUND");
    }
  }
  // PUBLIC: anyone can see

  const completedDayKeys = challenge.dayStatuses
    .filter((ds) => ds.completed)
    .map((ds) => ds.dayKey);

  const latestCompletedDayKey = completedDayKeys.length > 0
    ? completedDayKeys.slice().sort().at(-1)!
    : null;

  const streakAsOf = latestCompletedDayKey ?? challenge.startDate;
  const streak = latestCompletedDayKey
    ? currentStreak(completedDayKeys, streakAsOf)
    : 0;
  const longest = longestStreak(completedDayKeys);

  return {
    ...challenge,
    currentStreak: streak,
    longestStreak: longest,
  };
}
