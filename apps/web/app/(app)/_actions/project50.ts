"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { startProject50, toggleRule } from "@/lib/project50";

export async function startProject50Action(timezone: string) {
  const uid = await requireUser();
  await startProject50(uid, timezone);
  revalidatePath("/");
}

export async function toggleRuleAction(ruleId: number, done: boolean) {
  const uid = await requireUser();
  await toggleRule(uid, ruleId, done);
  revalidatePath("/");
}
