/**
 * RNTL tests for Project50Screen. The useProject50 hook is mocked so each of
 * the NONE / ACTIVE / FAILED / COMPLETED / loading / error states is driven
 * deterministically, and start/toggle actions are asserted.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

jest.mock("../viewmodels/project50", () => ({
  useProject50: jest.fn(),
}));

import { useProject50 } from "../viewmodels/project50";
import type { Project50Display } from "../viewmodels/project50";
import { Project50Screen } from "./Project50Screen";

const mockUse = useProject50 as jest.Mock;

interface HookOverrides {
  loading?: boolean;
  error?: string | null;
  display?: Project50Display | null;
  start?: jest.Mock;
  toggle?: jest.Mock;
}

function setHook(overrides: HookOverrides = {}) {
  const value = {
    loading: overrides.loading ?? false,
    error: overrides.error ?? null,
    display: overrides.display ?? null,
    start: overrides.start ?? jest.fn(),
    toggle: overrides.toggle ?? jest.fn(),
  };
  mockUse.mockReturnValue(value);
  return value;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Project50Screen", () => {
  it("renders the loading indicator", () => {
    setHook({ loading: true });
    render(<Project50Screen />);
    expect(screen.getByTestId("p50-loading")).toBeTruthy();
  });

  it("renders the error state", () => {
    setHook({ error: "Network down" });
    render(<Project50Screen />);
    expect(screen.getByTestId("p50-error")).toBeTruthy();
    expect(screen.getByText("Network down")).toBeTruthy();
  });

  it("renders the NONE start choice and starts on press", () => {
    const start = jest.fn();
    setHook({ display: { status: "NONE" }, start });
    render(<Project50Screen />);
    expect(screen.getByTestId("p50-none")).toBeTruthy();
    fireEvent.press(screen.getByTestId("p50-start"));
    expect(start).toHaveBeenCalledTimes(1);
    // a timezone string is passed
    expect(typeof start.mock.calls[0][0]).toBe("string");
  });

  it("renders the ACTIVE state with day, progress and 7 rule rows", () => {
    setHook({
      display: {
        status: "ACTIVE",
        dayLabel: "Day 3/50",
        progressLabel: "2/7",
        rules: [
          { id: 1, title: "Wake up", detail: "early", done: true },
          { id: 2, title: "Routine", detail: "1h", done: false },
          { id: 3, title: "Exercise", detail: "1h", done: true },
          { id: 4, title: "Read", detail: "10 pages", done: false },
          { id: 5, title: "Skill", detail: "1h", done: false },
          { id: 6, title: "Water", detail: "hydrate", done: false },
          { id: 7, title: "Track", detail: "journal", done: false },
        ],
      },
    });
    render(<Project50Screen />);
    expect(screen.getByTestId("p50-active")).toBeTruthy();
    expect(screen.getByText("Day 3/50")).toBeTruthy();
    expect(screen.getByText("2/7 rules today")).toBeTruthy();
    expect(screen.getByTestId("p50-rule-1")).toBeTruthy();
    expect(screen.getByTestId("p50-rule-7")).toBeTruthy();
    // done rule shows a checkmark; not-done rule does not
    expect(screen.getByTestId("p50-rule-1-check")).toBeTruthy();
    expect(screen.queryByTestId("p50-rule-2-check")).toBeNull();
  });

  it("toggles a rule on press with the negated done value", () => {
    const toggle = jest.fn();
    setHook({
      display: {
        status: "ACTIVE",
        dayLabel: "Day 1/50",
        progressLabel: "0/7",
        rules: [{ id: 1, title: "Wake up", detail: "early", done: false }],
      },
      toggle,
    });
    render(<Project50Screen />);
    fireEvent.press(screen.getByTestId("p50-rule-1"));
    expect(toggle).toHaveBeenCalledWith(1, true);
  });

  it("renders FAILED with day + rule and restarts on press", () => {
    const start = jest.fn();
    setHook({
      display: {
        status: "FAILED",
        failedDayLabel: "Day 12",
        failedRuleTitle: "Exercise",
      },
      start,
    });
    render(<Project50Screen />);
    expect(screen.getByTestId("p50-failed")).toBeTruthy();
    expect(screen.getByText("You missed Day 12: Exercise")).toBeTruthy();
    fireEvent.press(screen.getByTestId("p50-restart"));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("renders FAILED day without a rule title", () => {
    setHook({
      display: { status: "FAILED", failedDayLabel: "Day 5" },
    });
    render(<Project50Screen />);
    expect(screen.getByText("You missed Day 5")).toBeTruthy();
  });

  it("renders FAILED with no day details", () => {
    setHook({ display: { status: "FAILED" } });
    render(<Project50Screen />);
    expect(screen.getByTestId("p50-failed")).toBeTruthy();
    expect(screen.queryByTestId("p50-failed-day")).toBeNull();
  });

  it("falls back to UTC when the device timezone is unavailable", () => {
    const start = jest.fn();
    setHook({ display: { status: "NONE" }, start });
    const spy = jest
      .spyOn(Intl, "DateTimeFormat")
      .mockReturnValue({
        resolvedOptions: () => ({ timeZone: "" }),
      } as unknown as Intl.DateTimeFormat);
    try {
      render(<Project50Screen />);
      fireEvent.press(screen.getByTestId("p50-start"));
      expect(start).toHaveBeenCalledWith("UTC");
    } finally {
      spy.mockRestore();
    }
  });

  it("renders the COMPLETED celebration", () => {
    setHook({ display: { status: "COMPLETED", completedDays: 50 } });
    render(<Project50Screen />);
    expect(screen.getByTestId("p50-completed")).toBeTruthy();
    expect(screen.getByText(/finished all 50 days/)).toBeTruthy();
  });
});
