"use client";

import { useTransition } from "react";
import { Project50View } from "./Project50View";
import type { Project50State } from "@/lib/project50";
import {
  startProject50Action,
  toggleRuleAction,
  attachProject50MediaAction,
} from "../_actions/project50";
import { saveJournalAction } from "../_actions/journal";
import { track } from "@/lib/analytics";

export function Project50Client({ state }: { state: Project50State }) {
  const [isPending, startTransition] = useTransition();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function start(restarted: boolean) {
    // No-op unless analytics is configured + consented (see lib/analytics).
    track("project50_started", { restarted });
    startTransition(() => void startProject50Action(tz));
  }

  return (
    <Project50View
      state={state}
      onStart={() => start(false)}
      onRestart={() => start(true)}
      onToggle={(ruleId, done) => {
        track("rule_toggled", { ruleId, done });
        startTransition(() => void toggleRuleAction(ruleId, done));
      }}
      onAttachMedia={(objectKey, width, height) => {
        track("project50_photo_added", {});
        startTransition(() => void attachProject50MediaAction(objectKey, width, height));
      }}
      onSaveJournal={(wins, lessons) => {
        track("project50_journal_saved", {});
        startTransition(() => void saveJournalAction(wins, lessons));
      }}
      savingJournal={isPending}
    />
  );
}
