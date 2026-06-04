"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { upsertJournal } from "@/lib/journal";
import { withActionLogging } from "@/lib/log-action";

export const saveJournalAction = withActionLogging(
  "saveJournalAction",
  async (wins: string, lessons: string) => {
    const uid = await requireUser();
    await upsertJournal(uid, { wins, lessons });
    revalidatePath("/");
  },
);
