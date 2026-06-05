"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { upsertJournal } from "@/lib/journal";
import { withActionLogging } from "@/lib/log-action";

export const saveJournalAction = withActionLogging(
  "saveJournalAction",
  async (wins: string, lessons: string, dayKey?: string) => {
    const uid = await requireUser();
    // `dayKey` is the day the client's editor was showing — passed so a save
    // after the dashboard crossed local midnight files under the visible day,
    // not the server-now day. upsertJournal validates it before persisting.
    await upsertJournal(uid, { wins, lessons }, new Date(), dayKey);
    revalidatePath("/");
  },
);
