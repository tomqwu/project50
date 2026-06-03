"use client";

import { useTransition } from "react";
import { Button } from "@project50/ui";
import { startProject50Action } from "../_actions/project50";

export function StartProject50Button() {
  const [, startTransition] = useTransition();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div style={{ padding: "24px 32px 0", textAlign: "center" }}>
      <Button
        variant="ghost"
        onClick={() => startTransition(() => void startProject50Action(tz))}
      >
        Start Project 50
      </Button>
    </div>
  );
}
