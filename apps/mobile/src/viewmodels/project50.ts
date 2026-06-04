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
import {
  loadProject50StateOffline,
  toggleRuleOffline,
  syncOnReconnect,
} from "../lib/offline";

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
  /**
   * True when the displayed data came from the local cache because the device
   * is offline (drives the "offline" indicator). Also set when a write was
   * queued offline rather than sent.
   */
  offline: boolean;
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
  const [offline, setOffline] = useState(false);

  const apply = useCallback((state: Project50State) => {
    setDisplay(deriveProject50Display(state));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Replay anything queued while offline before reading fresh state.
      await syncOnReconnect(client);
      const { state, fromCache } = await loadProject50StateOffline(client);
      setOffline(fromCache);
      if (state) {
        apply(state);
      } else if (fromCache) {
        // Offline with no cached state yet — nothing to show, but it isn't an error.
        setDisplay({ status: "NONE" });
      }
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
        setOffline(false);
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
        const { state, queued } = await toggleRuleOffline(client, ruleId, done);
        if (queued) {
          // Offline: optimistically reflect the toggle on the current display so
          // the UI stays responsive; it will be synced on reconnect.
          setOffline(true);
          setDisplay((prev) => applyOptimisticToggle(prev, ruleId, done));
        } else if (state) {
          setOffline(false);
          apply(state);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update rule");
      }
    },
    [client, apply],
  );

  return { loading, error, display, offline, start, toggle };
}

/**
 * Optimistically reflect a queued (offline) rule toggle on the current display.
 * Recomputes the progress label from the updated rule set. No-op unless the
 * display is an ACTIVE run with rules.
 */
export function applyOptimisticToggle(
  prev: Project50Display | null,
  ruleId: number,
  done: boolean,
): Project50Display | null {
  if (!prev || prev.status !== "ACTIVE" || !prev.rules) {
    return prev;
  }
  const rules = prev.rules.map((r) => (r.id === ruleId ? { ...r, done } : r));
  const completedCount = rules.filter((r) => r.done).length;
  return {
    ...prev,
    rules,
    progressLabel: `${completedCount}/${PROJECT50_RULES.length}`,
  };
}
