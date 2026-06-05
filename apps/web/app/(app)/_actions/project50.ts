"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import {
  startProject50,
  toggleRule,
  attachProject50DayMedia,
  removeProject50DayMedia,
} from "@/lib/project50";
import { withActionLogging } from "@/lib/log-action";

export const startProject50Action = withActionLogging(
  "startProject50Action",
  async (timezone: string) => {
    const uid = await requireUser();
    await startProject50(uid, timezone);
    revalidatePath("/");
  },
);

export const toggleRuleAction = withActionLogging(
  "toggleRuleAction",
  async (ruleId: number, done: boolean) => {
    const uid = await requireUser();
    await toggleRule(uid, ruleId, done);
    revalidatePath("/");
  },
);

export const attachProject50MediaAction = withActionLogging(
  "attachProject50MediaAction",
  async (objectKey: string, width: number, height: number) => {
    const uid = await requireUser();
    await attachProject50DayMedia(uid, { objectKey, width, height });
    revalidatePath("/");
  },
);

export const removeProject50MediaAction = withActionLogging(
  "removeProject50MediaAction",
  async (mediaId: string) => {
    const uid = await requireUser();
    await removeProject50DayMedia(uid, mediaId);
    revalidatePath("/");
  },
);
