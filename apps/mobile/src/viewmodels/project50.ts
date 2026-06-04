/**
 * Project 50 view-model.
 *
 * Exposes the user's Project50State plus start/toggle actions and a derived,
 * display-ready shape (Day n/50, n/7, FAILED, COMPLETED). The rule catalog
 * comes from @project50/core (PROJECT50_RULES) so titles/details stay in sync
 * with the web app.
 */

import { useCallback, useEffect, useState } from "react";
import { PROJECT50_RULES, PROJECT50_LENGTH_DAYS } from "@project50/core";
import { apiClient } from "../lib/apiClient";
import type { ApiClient, Project50State } from "../lib/apiClient";

export interface Project50RuleRow {
  id: number;
  title: string;
  detail: string;
  done: boolean;
}

export interface Project50Display {
  status: Project50State["status"];
  /** "Day n/50" for ACTIVE runs; undefined otherwise. */
  dayLabel?: string;
  /** "n/7" rules completed today for ACTIVE runs; undefined otherwise. */
  progressLabel?: string;
  /** The 7 rule rows with today's done state, for ACTIVE runs. */
  rules?: Project50RuleRow[];
  /** "Day n" the streak broke, for FAILED runs. */
  failedDayLabel?: string;
  /** Title of the rule that was missed, for FAILED runs. */
  failedRuleTitle?: string;
  /** Number of days completed, for COMPLETED runs. */
  completedDays?: number;
}

/**
 * Derive the display shape from a raw Project50State. Pure function, exported
 * for direct unit testing.
 */
export function deriveProject50Display(state: Project50State): Project50Display {
  if (state.status === "ACTIVE" && state.today) {
    const { dayNumber, checks, completedCount } = state.today;
    const rules: Project50RuleRow[] = PROJECT50_RULES.map((rule) => ({
      id: rule.id,
      title: rule.title,
      detail: rule.detail,
      done: checks[rule.id - 1] ?? false,
    }));
    return {
      status: "ACTIVE",
      dayLabel: `Day ${dayNumber}/${PROJECT50_LENGTH_DAYS}`,
      progressLabel: `${completedCount}/${PROJECT50_RULES.length}`,
      rules,
    };
  }

  if (state.status === "FAILED") {
    const failedRule = PROJECT50_RULES.find((r) => r.id === state.failedRuleId);
    return {
      status: "FAILED",
      failedDayLabel:
        state.failedDayNumber !== undefined ? `Day ${state.failedDayNumber}` : undefined,
      failedRuleTitle: failedRule?.title,
    };
  }

  if (state.status === "COMPLETED") {
    return {
      status: "COMPLETED",
      completedDays: state.completedDays ?? PROJECT50_LENGTH_DAYS,
    };
  }

  return { status: "NONE" };
}

export interface UseProject50Result {
  loading: boolean;
  error: string | null;
  display: Project50Display | null;
  start: (timezone: string) => Promise<void>;
  toggle: (ruleId: number, done: boolean) => Promise<void>;
}

/**
 * Hook driving the Project 50 screen. Loads state on mount and exposes
 * start/toggle actions that refresh the derived display.
 *
 * @param client - injectable for tests; defaults to the shared singleton.
 */
export function useProject50(client: ApiClient = apiClient): UseProject50Result {
  const [display, setDisplay] = useState<Project50Display | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((state: Project50State) => {
    setDisplay(deriveProject50Display(state));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const state = await client.getProject50State();
      apply(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Project 50");
    } finally {
      setLoading(false);
    }
  }, [client, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = useCallback(
    async (timezone: string) => {
      try {
        setError(null);
        const state = await client.startProject50(timezone);
        apply(state);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start Project 50");
      }
    },
    [client, apply],
  );

  const toggle = useCallback(
    async (ruleId: number, done: boolean) => {
      try {
        setError(null);
        const state = await client.toggleRule(ruleId, done);
        apply(state);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update rule");
      }
    },
    [client, apply],
  );

  return { loading, error, display, start, toggle };
}
