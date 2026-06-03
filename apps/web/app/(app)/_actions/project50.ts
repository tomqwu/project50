"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { startProject50, toggleRule } from "@/lib/project50";
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
