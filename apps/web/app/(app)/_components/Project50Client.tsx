"use client";

import { useTransition } from "react";
import { Project50View } from "./Project50View";
import type { Project50State } from "@/lib/project50";
import { startProject50Action, toggleRuleAction } from "../_actions/project50";

export function Project50Client({ state }: { state: Project50State }) {
  const [, startTransition] = useTransition();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Project50View
      state={state}
      onStart={() => startTransition(() => void startProject50Action(tz))}
      onRestart={() => startTransition(() => void startProject50Action(tz))}
      onToggle={(ruleId, done) => startTransition(() => void toggleRuleAction(ruleId, done))}
    />
  );
}
