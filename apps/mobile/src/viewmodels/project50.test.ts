/**
 * Tests for the Project 50 view-model: the pure deriveProject50Display mapper
 * and the useProject50 hook (load / start / toggle / error paths).
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { PROJECT50_RULES, PROJECT50_LENGTH_DAYS } from "@project50/core";

jest.mock("../lib/apiClient", () => ({
  apiClient: {
    getProject50State: jest.fn(),
    startProject50: jest.fn(),
    toggleRule: jest.fn(),
  },
}));

// Mock the offline layer (independently unit-tested in offline.test.ts) so the
// viewmodel tests stay focused on the hook and don't touch native modules.
// By default the mocks delegate to the injected client and report "online", so
// the pre-existing online assertions (client.* called) continue to hold.
jest.mock("../lib/offline", () => ({
  loadProject50StateOffline: jest.fn(async (client) => ({
    state: await client.getProject50State(),
    fromCache: false,
  })),
  toggleRuleOffline: jest.fn(async (client, ruleId, done) => ({
    state: await client.toggleRule(ruleId, done),
    queued: false,
  })),
  syncOnReconnect: jest.fn(async () => ({ flushed: 0, remaining: 0 })),
}));

import { deriveProject50Display, useProject50, applyOptimisticToggle } from "./project50";
import { apiClient } from "../lib/apiClient";
import {
  loadProject50StateOffline,
  toggleRuleOffline,
  syncOnReconnect,
} from "../lib/offline";
import type { Project50State } from "../lib/apiClient";
import type { Project50Display } from "./project50";

const mockLoad = loadProject50StateOffline as jest.Mock;
const mockToggle = toggleRuleOffline as jest.Mock;
const mockSync = syncOnReconnect as jest.Mock;

// ─── deriveProject50Display ────────────────────────────────────────────────────

describe("deriveProject50Display", () => {
  it("maps NONE", () => {
    expect(deriveProject50Display({ status: "NONE" })).toEqual({ status: "NONE" });
  });

  it("maps ACTIVE into day label, progress label and rule rows", () => {
    const state: Project50State = {
      status: "ACTIVE",
      runId: "r1",
      today: {
        dayKey: "2026-06-03",
        dayNumber: 3,
        // rule 1 and rule 3 done
        checks: [true, false, true, false, false, false, false],
        completedCount: 2,
      },
    };
    const d = deriveProject50Display(state);
    expect(d.status).toBe("ACTIVE");
    expect(d.dayLabel).toBe(`Day 3/${PROJECT50_LENGTH_DAYS}`);
    expect(d.progressLabel).toBe(`2/${PROJECT50_RULES.length}`);
    expect(d.rules).toHaveLength(7);
    expect(d.rules![0]).toMatchObject({ id: 1, done: true, title: PROJECT50_RULES[0]!.title });
    expect(d.rules![1]!.done).toBe(false);
    expect(d.rules![2]!.done).toBe(true);
  });

  it("falls back to done:false when a check index is missing", () => {
    const state: Project50State = {
      status: "ACTIVE",
      today: { dayKey: "2026-06-03", dayNumber: 1, checks: [], completedCount: 0 },
    };
    const d = deriveProject50Display(state);
    expect(d.rules!.every((r) => r.done === false)).toBe(true);
  });

  it("treats ACTIVE without a today payload as NONE", () => {
    // Defensive: status ACTIVE but no today (should not happen from the API).
    const d = deriveProject50Display({ status: "ACTIVE" });
    expect(d).toEqual({ status: "NONE" });
  });

  it("maps FAILED with day and rule title", () => {
    const d = deriveProject50Display({
      status: "FAILED",
      failedDayNumber: 12,
      failedRuleId: 4,
    });
    expect(d.status).toBe("FAILED");
    expect(d.failedDayLabel).toBe("Day 12");
    expect(d.failedRuleTitle).toBe(PROJECT50_RULES[3]!.title);
  });

  it("maps FAILED with no day/rule details", () => {
    const d = deriveProject50Display({ status: "FAILED" });
    expect(d.status).toBe("FAILED");
    expect(d.failedDayLabel).toBeUndefined();
    expect(d.failedRuleTitle).toBeUndefined();
  });

  it("maps COMPLETED with completedDays", () => {
    const d = deriveProject50Display({ status: "COMPLETED", completedDays: 50 });
    expect(d).toEqual({ status: "COMPLETED", completedDays: 50 });
  });

  it("maps COMPLETED with default day count when missing", () => {
    const d = deriveProject50Display({ status: "COMPLETED" });
    expect(d.completedDays).toBe(PROJECT50_LENGTH_DAYS);
  });
});

// ─── useProject50 hook ─────────────────────────────────────────────────────────

function fakeClient() {
  return {
    getProject50State: jest.fn(),
    startProject50: jest.fn(),
    toggleRule: jest.fn(),
  };
}

const NONE: Project50State = { status: "NONE" };
const ACTIVE: Project50State = {
  status: "ACTIVE",
  today: {
    dayKey: "2026-06-03",
    dayNumber: 1,
    checks: [false, false, false, false, false, false, false],
    completedCount: 0,
  },
};

describe("useProject50", () => {
  beforeEach(() => {
    // Reset offline mocks to their default online/delegating behaviour.
    mockSync.mockImplementation(async () => ({ flushed: 0, remaining: 0 }));
    mockLoad.mockImplementation(async (client) => ({
      state: await client.getProject50State(),
      fromCache: false,
    }));
    mockToggle.mockImplementation(async (client, ruleId, done) => ({
      state: await client.toggleRule(ruleId, done),
      queued: false,
    }));
  });

  it("loads state on mount", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(NONE);

    const { result } = renderHook(() => useProject50(client as never));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.display).toEqual({ status: "NONE" });
    expect(result.current.error).toBeNull();
  });

  it("sets an error when load fails", async () => {
    const client = fakeClient();
    client.getProject50State.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
    expect(result.current.display).toBeNull();
  });

  it("uses a generic message for non-Error load failures", async () => {
    const client = fakeClient();
    client.getProject50State.mockRejectedValue("nope");

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to load Project 50");
  });

  it("start() begins a run and applies the new state", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(NONE);
    client.startProject50.mockResolvedValue(ACTIVE);

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start("UTC");
    });
    expect(client.startProject50).toHaveBeenCalledWith("UTC");
    expect(result.current.display!.status).toBe("ACTIVE");
  });

  it("start() surfaces an error on failure", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(NONE);
    client.startProject50.mockRejectedValue(new Error("start failed"));

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start("UTC");
    });
    expect(result.current.error).toBe("start failed");
  });

  it("start() uses a generic message for non-Error failures", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(NONE);
    client.startProject50.mockRejectedValue("x");

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start("UTC");
    });
    expect(result.current.error).toBe("Failed to start Project 50");
  });

  it("toggle() updates the rule and applies the new state", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(ACTIVE);
    const toggled: Project50State = {
      status: "ACTIVE",
      today: {
        dayKey: "2026-06-03",
        dayNumber: 1,
        checks: [true, false, false, false, false, false, false],
        completedCount: 1,
      },
    };
    client.toggleRule.mockResolvedValue(toggled);

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle(1, true);
    });
    expect(client.toggleRule).toHaveBeenCalledWith(1, true);
    expect(result.current.display!.rules![0]!.done).toBe(true);
    expect(result.current.display!.progressLabel).toBe(`1/${PROJECT50_RULES.length}`);
  });

  it("toggle() surfaces an error on failure", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(ACTIVE);
    client.toggleRule.mockRejectedValue(new Error("toggle failed"));

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle(1, true);
    });
    expect(result.current.error).toBe("toggle failed");
  });

  it("toggle() uses a generic message for non-Error failures", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(ACTIVE);
    client.toggleRule.mockRejectedValue("x");

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle(1, true);
    });
    expect(result.current.error).toBe("Failed to update rule");
  });

  it("defaults to the shared singleton client when none is passed", async () => {
    // Exercises the default-parameter branch: the mocked singleton is used.
    (apiClient.getProject50State as jest.Mock).mockResolvedValue(NONE);
    const { result } = renderHook(() => useProject50());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiClient.getProject50State).toHaveBeenCalled();
    expect(result.current.display).toEqual({ status: "NONE" });
  });

  // ─── Offline behaviour ──────────────────────────────────────────────────────

  it("flushes the queue on load before reading state", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(NONE);
    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockSync).toHaveBeenCalledWith(client);
    expect(result.current.offline).toBe(false);
  });

  it("marks offline and shows cached state when load is from cache", async () => {
    const client = fakeClient();
    mockLoad.mockResolvedValue({ state: ACTIVE, fromCache: true });
    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);
    expect(result.current.display!.status).toBe("ACTIVE");
  });

  it("shows a NONE placeholder when offline with no cached state", async () => {
    const client = fakeClient();
    mockLoad.mockResolvedValue({ state: null, fromCache: true });
    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);
    expect(result.current.display).toEqual({ status: "NONE" });
    expect(result.current.error).toBeNull();
  });

  it("toggle() optimistically updates and marks offline when queued", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(ACTIVE);
    mockToggle.mockResolvedValue({ state: null, queued: true });

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle(1, true);
    });
    expect(result.current.offline).toBe(true);
    // optimistic: rule 1 now done, progress recomputed
    expect(result.current.display!.rules![0]!.done).toBe(true);
    expect(result.current.display!.progressLabel).toBe(`1/${PROJECT50_RULES.length}`);
  });

  it("leaves the display untouched when load returns null state while online", async () => {
    // Defensive: online (fromCache:false) but no state — neither apply nor placeholder.
    const client = fakeClient();
    mockLoad.mockResolvedValue({ state: null, fromCache: false });
    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(false);
    expect(result.current.display).toBeNull();
  });

  it("leaves the display untouched when an online toggle returns null state", async () => {
    // Defensive: not queued and no state — neither optimistic nor apply runs.
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(ACTIVE);
    mockToggle.mockResolvedValue({ state: null, queued: false });

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = result.current.display;

    await act(async () => {
      await result.current.toggle(1, true);
    });
    expect(result.current.offline).toBe(false);
    expect(result.current.display).toBe(before);
  });

  it("start() clears the offline flag", async () => {
    const client = fakeClient();
    client.getProject50State.mockResolvedValue(NONE);
    mockLoad.mockResolvedValueOnce({ state: NONE, fromCache: true });
    client.startProject50.mockResolvedValue(ACTIVE);

    const { result } = renderHook(() => useProject50(client as never));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);

    await act(async () => {
      await result.current.start("UTC");
    });
    expect(result.current.offline).toBe(false);
    expect(result.current.display!.status).toBe("ACTIVE");
  });
});

// ─── applyOptimisticToggle ──────────────────────────────────────────────────

describe("applyOptimisticToggle", () => {
  const activeDisplay: Project50Display = {
    status: "ACTIVE",
    dayLabel: "Day 1/50",
    progressLabel: "0/7",
    rules: PROJECT50_RULES.map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.detail,
      done: false,
    })),
  };

  it("toggles the targeted rule and recomputes progress", () => {
    const out = applyOptimisticToggle(activeDisplay, 2, true);
    expect(out!.rules!.find((r) => r.id === 2)!.done).toBe(true);
    expect(out!.rules!.find((r) => r.id === 1)!.done).toBe(false);
    expect(out!.progressLabel).toBe(`1/${PROJECT50_RULES.length}`);
  });

  it("returns the input unchanged for a null display", () => {
    expect(applyOptimisticToggle(null, 1, true)).toBeNull();
  });

  it("returns the input unchanged for a non-ACTIVE display", () => {
    const none: Project50Display = { status: "NONE" };
    expect(applyOptimisticToggle(none, 1, true)).toBe(none);
  });

  it("returns the input unchanged for an ACTIVE display without rules", () => {
    const noRules: Project50Display = { status: "ACTIVE", dayLabel: "Day 1/50" };
    expect(applyOptimisticToggle(noRules, 1, true)).toBe(noRules);
  });
});
