/**
 * Demo seed — idempotent, dev-only.
 *
 * Creates users demo/maya/leo with a rich set of challenges, activities,
 * dayStatuses, milestones, follows, and cheers so the app shows real life on
 * first login. All completion/streak/milestone values are computed via
 * @project50/core — no hand-faked numbers.
 *
 * Run: pnpm --filter @project50/db seed   (or: make seed)
 * Re-runnable: deletes demo/maya/leo then recreates.
 */

import { PrismaClient } from "@prisma/client";
import {
  addDays,
  computeDayCompletion,
  currentStreak,
  evaluateMilestones,
  localDayKey,
  type DayKey,
} from "@project50/core";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build all day keys from startDate up to and including endDate (inclusive). */
function dayRange(startDate: DayKey, endDate: DayKey): DayKey[] {
  const days: DayKey[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const today = localDayKey(new Date(), "UTC");

  console.log(`[seed] today = ${today}`);
  console.log("[seed] Clearing demo/maya/leo users (cascade deletes their data)...");

  // Idempotent: delete existing users by handle (cascade handles all relations)
  await prisma.user.deleteMany({ where: { handle: { in: ["demo", "maya", "leo"] } } });

  console.log("[seed] Deleted. Recreating...");

  // ---------------------------------------------------------------------------
  // 1. Create users
  // ---------------------------------------------------------------------------
  const demo = await prisma.user.create({
    data: { handle: "demo", displayName: "Demo Runner" },
  });
  const maya = await prisma.user.create({
    data: { handle: "maya", displayName: "Maya R." },
  });
  const leo = await prisma.user.create({
    data: { handle: "leo", displayName: "Leo K." },
  });

  console.log(`[seed] Created users: demo(${demo.id}), maya(${maya.id}), leo(${leo.id})`);

  // ---------------------------------------------------------------------------
  // 2. Follows: demo follows maya and leo
  // ---------------------------------------------------------------------------
  await prisma.follow.createMany({
    data: [
      { followerId: demo.id, followeeId: maya.id },
      { followerId: demo.id, followeeId: leo.id },
    ],
  });

  console.log("[seed] Follows created.");

  // ---------------------------------------------------------------------------
  // 3. PRIMARY challenge: TARGET "Work out 1 hr/day"
  // ---------------------------------------------------------------------------
  const primaryStart = addDays(today, -23); // 24 days in progress (day 1 = startDate)

  const primaryChallenge = await prisma.challenge.create({
    data: {
      ownerId: demo.id,
      title: "Work out 1 hr/day",
      goalType: "TARGET",
      unit: "min",
      dailyTarget: 60,
      startDate: primaryStart,
      timezone: "UTC",
      lengthDays: 50,
      visibility: "PUBLIC",
    },
  });

  console.log(`[seed] Primary challenge created: ${primaryChallenge.id}`);

  // Days in the primary challenge
  const primaryDays = dayRange(primaryStart, today); // 24 days

  // Gap days (skip activity on day index 4 and 13, i.e. the 5th and 14th day)
  const gapDays = new Set<string>([
    primaryDays[4] ?? "",
    primaryDays[13] ?? "",
  ].filter(Boolean));

  // Activity data per day: varies amounts to feel real
  const activityPatterns: Array<{ sets: Array<{ type: string; amount: number; note: string; mood: number }> }> = [
    { sets: [{ type: "Run", amount: 65, note: "Morning 5k, felt strong!", mood: 5 }] },
    { sets: [{ type: "Gym", amount: 30, note: "Upper body day" , mood: 4 }, { type: "Gym", amount: 35, note: "Core finisher", mood: 4 }] },
    { sets: [{ type: "Bike", amount: 75, note: "Long ride around the park", mood: 5 }] },
    { sets: [{ type: "Run", amount: 30, note: "Easy 3k warmup", mood: 3 }, { type: "Gym", amount: 35, note: "Leg day", mood: 4 }] },
    { sets: [{ type: "Gym", amount: 60, note: "Full body circuit", mood: 4 }] },
    { sets: [{ type: "Run", amount: 62, note: "Hit the trail — great weather", mood: 5 }] },
    { sets: [{ type: "Bike", amount: 45, note: "Spin class", mood: 4 }, { type: "Gym", amount: 20, note: "Stretch + foam roll", mood: 4 }] },
    { sets: [{ type: "Run", amount: 30, note: "Short recovery run", mood: 3 }, { type: "Gym", amount: 30, note: "Shoulders", mood: 3 }] },
    { sets: [{ type: "Gym", amount: 70, note: "Back + biceps", mood: 4 }] },
    { sets: [{ type: "Run", amount: 60, note: "Tempo run, new PR pace", mood: 5 }] },
    { sets: [{ type: "Bike", amount: 90, note: "Weekend long ride", mood: 5 }] },
    { sets: [{ type: "Gym", amount: 60, note: "Push day", mood: 4 }] },
    { sets: [{ type: "Run", amount: 35, note: "Drizzly morning run", mood: 3 }, { type: "Gym", amount: 30, note: "Quick abs", mood: 3 }] },
    { sets: [{ type: "Gym", amount: 60, note: "Power clean practice", mood: 5 }] },
    { sets: [{ type: "Run", amount: 65, note: "Fartlek intervals", mood: 4 }] },
    { sets: [{ type: "Bike", amount: 60, note: "Steady state cardio", mood: 4 }] },
    { sets: [{ type: "Gym", amount: 75, note: "Pull day + HIIT finisher", mood: 5 }] },
    { sets: [{ type: "Run", amount: 60, note: "Early morning sunrise run", mood: 5 }] },
    { sets: [{ type: "Gym", amount: 30, note: "Arms", mood: 3 }, { type: "Gym", amount: 35, note: "Cardio cooldown", mood: 3 }] },
    { sets: [{ type: "Run", amount: 60, note: "Tempo effort, strong finish", mood: 5 }] },
    { sets: [{ type: "Bike", amount: 70, note: "Hill repeats", mood: 4 }] },
    { sets: [{ type: "Gym", amount: 60, note: "Deadlift focus", mood: 4 }] },
  ];

  const completedPrimaryDays: DayKey[] = [];
  const activityIds: string[] = []; // track recent for cheers

  let patternIdx = 0;
  for (const dayKey of primaryDays) {
    if (gapDays.has(dayKey)) {
      // Gap day: upsert DayStatus with 0/false
      await prisma.dayStatus.upsert({
        where: { challengeId_dayKey: { challengeId: primaryChallenge.id, dayKey } },
        update: { totalAmount: 0, completed: false },
        create: { challengeId: primaryChallenge.id, dayKey, totalAmount: 0, completed: false },
      });
      continue;
    }

    const pattern = activityPatterns[patternIdx % activityPatterns.length];
    patternIdx++;

    // Create activity rows
    const dayActivities: Array<{ amount?: number; done?: boolean }> = [];
    for (const act of pattern?.sets ?? []) {
      const created = await prisma.activity.create({
        data: {
          challengeId: primaryChallenge.id,
          userId: demo.id,
          dayKey,
          activityType: act.type,
          amount: act.amount,
          done: false,
          note: act.note,
          mood: act.mood,
        },
      });
      dayActivities.push({ amount: act.amount });
      activityIds.push(created.id);
    }

    // Compute completion via core
    const { totalAmount, completed } = computeDayCompletion(
      { goalType: "TARGET", dailyTarget: 60 },
      dayActivities,
    );

    await prisma.dayStatus.upsert({
      where: { challengeId_dayKey: { challengeId: primaryChallenge.id, dayKey } },
      update: { totalAmount, completed },
      create: { challengeId: primaryChallenge.id, dayKey, totalAmount, completed },
    });

    if (completed) completedPrimaryDays.push(dayKey);
  }

  // Milestones for primary challenge
  const primaryCompletedCount = completedPrimaryDays.length;
  const primaryCurrentStreak = currentStreak(completedPrimaryDays, today);
  const primaryMilestones = evaluateMilestones({
    completedCount: primaryCompletedCount,
    currentStreak: primaryCurrentStreak,
  });

  for (const kind of primaryMilestones) {
    await prisma.milestone.upsert({
      where: { challengeId_kind: { challengeId: primaryChallenge.id, kind } },
      update: {},
      create: { challengeId: primaryChallenge.id, kind },
    });
  }

  console.log(
    `[seed] Primary challenge: ${primaryCompletedCount} completed days, streak ${primaryCurrentStreak}, milestones [${primaryMilestones.join(", ")}]`,
  );

  // ---------------------------------------------------------------------------
  // 4. SECOND challenge: BINARY "Read 30 min"
  // ---------------------------------------------------------------------------
  const binaryStart = addDays(today, -23);

  const binaryChallenge = await prisma.challenge.create({
    data: {
      ownerId: demo.id,
      title: "Read 30 min",
      goalType: "BINARY",
      startDate: binaryStart,
      timezone: "UTC",
      lengthDays: 50,
      visibility: "PUBLIC",
    },
  });

  console.log(`[seed] Binary challenge created: ${binaryChallenge.id}`);

  const binaryDays = dayRange(binaryStart, today);
  // ~15 "done" days — mark the first 15 days (spaced across the 24) as done
  // Use a simple pattern: done on days where index % 2 === 0 but not more than 15
  const binaryDoneIndices = new Set<number>();
  let doneCount = 0;
  for (let i = 0; i < binaryDays.length; i++) {
    if (i % 2 === 0 && doneCount < 15) {
      binaryDoneIndices.add(i);
      doneCount++;
    }
  }

  const completedBinaryDays: DayKey[] = [];

  for (let i = 0; i < binaryDays.length; i++) {
    const dayKey = binaryDays[i];
    if (!dayKey) continue;
    const isDone = binaryDoneIndices.has(i);

    if (isDone) {
      await prisma.activity.create({
        data: {
          challengeId: binaryChallenge.id,
          userId: demo.id,
          dayKey,
          done: true,
          note: "Read before bed — great chapter!",
          mood: 4,
        },
      });
    }

    const { totalAmount, completed } = computeDayCompletion(
      { goalType: "BINARY" },
      isDone ? [{ done: true }] : [],
    );

    await prisma.dayStatus.upsert({
      where: { challengeId_dayKey: { challengeId: binaryChallenge.id, dayKey } },
      update: { totalAmount, completed },
      create: { challengeId: binaryChallenge.id, dayKey, totalAmount, completed },
    });

    if (completed) completedBinaryDays.push(dayKey);
  }

  const binaryCompletedCount = completedBinaryDays.length;
  const binaryCurrentStreak = currentStreak(completedBinaryDays, today);
  const binaryMilestones = evaluateMilestones({
    completedCount: binaryCompletedCount,
    currentStreak: binaryCurrentStreak,
  });

  for (const kind of binaryMilestones) {
    await prisma.milestone.upsert({
      where: { challengeId_kind: { challengeId: binaryChallenge.id, kind } },
      update: {},
      create: { challengeId: binaryChallenge.id, kind },
    });
  }

  console.log(
    `[seed] Binary challenge: ${binaryCompletedCount} completed days, streak ${binaryCurrentStreak}, milestones [${binaryMilestones.join(", ")}]`,
  );

  // ---------------------------------------------------------------------------
  // 5. Followees' content for the feed
  // ---------------------------------------------------------------------------

  // maya: TARGET "Marathon Prep"
  const mayaStart = addDays(today, -9);
  const mayaChallenge = await prisma.challenge.create({
    data: {
      ownerId: maya.id,
      title: "Marathon Prep",
      goalType: "TARGET",
      unit: "km",
      dailyTarget: 10,
      startDate: mayaStart,
      timezone: "UTC",
      lengthDays: 50,
      visibility: "PUBLIC",
    },
  });

  const mayaActivities = [
    { dayKey: addDays(today, -2), note: "Rainy 5k — pushed through!", activityType: "Run", amount: 12, mood: 4 },
    { dayKey: addDays(today, -1), note: "Track intervals, 10x400m", activityType: "Run", amount: 10, mood: 5 },
    { dayKey: today, note: "Easy long run, 18k", activityType: "Run", amount: 18, mood: 5 },
  ];

  for (const act of mayaActivities) {
    await prisma.activity.create({
      data: {
        challengeId: mayaChallenge.id,
        userId: maya.id,
        dayKey: act.dayKey,
        activityType: act.activityType,
        amount: act.amount,
        done: false,
        note: act.note,
        mood: act.mood,
      },
    });
    const { totalAmount, completed } = computeDayCompletion(
      { goalType: "TARGET", dailyTarget: 10 },
      [{ amount: act.amount }],
    );
    await prisma.dayStatus.upsert({
      where: { challengeId_dayKey: { challengeId: mayaChallenge.id, dayKey: act.dayKey } },
      update: { totalAmount, completed },
      create: { challengeId: mayaChallenge.id, dayKey: act.dayKey, totalAmount, completed },
    });
  }

  console.log("[seed] Maya's challenge + activities created.");

  // leo: BINARY "Daily Pages"
  const leoStart = addDays(today, -9);
  const leoChallenge = await prisma.challenge.create({
    data: {
      ownerId: leo.id,
      title: "Daily Pages",
      goalType: "BINARY",
      startDate: leoStart,
      timezone: "UTC",
      lengthDays: 50,
      visibility: "PUBLIC",
    },
  });

  const leoActivities = [
    { dayKey: addDays(today, -1), note: "3 pages — got into the zone", mood: 5 },
    { dayKey: today, note: "Morning pages before breakfast", mood: 4 },
  ];

  for (const act of leoActivities) {
    await prisma.activity.create({
      data: {
        challengeId: leoChallenge.id,
        userId: leo.id,
        dayKey: act.dayKey,
        done: true,
        note: act.note,
        mood: act.mood,
      },
    });
    const { totalAmount, completed } = computeDayCompletion(
      { goalType: "BINARY" },
      [{ done: true }],
    );
    await prisma.dayStatus.upsert({
      where: { challengeId_dayKey: { challengeId: leoChallenge.id, dayKey: act.dayKey } },
      update: { totalAmount, completed },
      create: { challengeId: leoChallenge.id, dayKey: act.dayKey, totalAmount, completed },
    });
  }

  console.log("[seed] Leo's challenge + activities created.");

  // ---------------------------------------------------------------------------
  // 6. CHEER reactions from maya + leo on demo's recent activities
  // ---------------------------------------------------------------------------
  // Pick the last 4 activity IDs created for the primary challenge (most recent days)
  const recentActivityIds = activityIds.slice(-4);

  const cheerData = [
    { activityId: recentActivityIds[0], userId: maya.id, text: "Keep it up! 🔥" },
    { activityId: recentActivityIds[1], userId: leo.id, text: "You're on fire!" },
    { activityId: recentActivityIds[2], userId: maya.id, text: "Crushing it!" },
    { activityId: recentActivityIds[3], userId: leo.id, text: "Amazing streak!" },
  ].filter((c) => c.activityId !== undefined);

  for (const cheer of cheerData) {
    if (!cheer.activityId) continue;
    await prisma.reaction.create({
      data: {
        activityId: cheer.activityId,
        userId: cheer.userId,
        kind: "CHEER",
        text: cheer.text,
      },
    });
  }

  console.log(`[seed] ${cheerData.length} CHEER reactions created.`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n[seed] Done! Summary:");
  console.log(`  demo primary challenge: ${primaryCompletedCount} completed days, current streak ${primaryCurrentStreak}`);
  console.log(`  demo binary challenge : ${binaryCompletedCount} completed days, current streak ${binaryCurrentStreak}`);
  console.log(`  demo follows maya + leo`);
  console.log(`  maya: 3 recent activities on "Marathon Prep"`);
  console.log(`  leo:  2 recent activities on "Daily Pages"`);
  console.log(`  cheers: ${cheerData.length} CHEER reactions on demo's activities`);
}

main()
  .catch((e) => {
    console.error("[seed] Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
