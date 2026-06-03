import { prisma } from "@project50/db";
import { unprocessable } from "./http";

const TARGET_TYPES = ["USER", "ACTIVITY"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

/** Block blockedId as blockerId. Idempotent (upsert). Rejects self-block. */
export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    unprocessable("cannot_block_self");
  }

  return prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { blockerId, blockedId },
  });
}

/** Unblock blockedId as blockerId. Idempotent (no-op if edge doesn't exist). */
export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.block.deleteMany({
    where: { blockerId, blockedId },
  });
}

/** Whether blockerId has blocked blockedId. */
export async function isBlocked(
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  const edge = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    select: { id: true },
  });
  return edge !== null;
}

export interface ReportInput {
  targetType: TargetType;
  targetId: string;
  reason: string;
}

/**
 * File a moderation report. Validates the targetType against the allowed set
 * and requires a non-empty reason. The reason is trimmed before storage.
 */
export async function reportTarget(reporterId: string, input: ReportInput) {
  const { targetType, targetId, reason } = input;

  if (!TARGET_TYPES.includes(targetType)) {
    unprocessable("invalid_target_type");
  }
  const trimmed = reason.trim();
  if (trimmed === "") {
    unprocessable("reason_required");
  }

  return prisma.report.create({
    data: { reporterId, targetType, targetId, reason: trimmed },
  });
}
