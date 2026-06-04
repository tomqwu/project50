import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Project50State } from "@/lib/project50";

const trackMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => trackMock(...a) }));

const startAction = vi.fn();
const toggleAction = vi.fn();
const attachAction = vi.fn();
const saveJournalAction = vi.fn();
vi.mock("../_actions/project50", () => ({
  startProject50Action: (...a: unknown[]) => startAction(...a),
  toggleRuleAction: (...a: unknown[]) => toggleAction(...a),
  attachProject50MediaAction: (...a: unknown[]) => attachAction(...a),
}));
vi.mock("../_actions/journal", () => ({
  saveJournalAction: (...a: unknown[]) => saveJournalAction(...a),
}));

// Replace Project50View with a thin harness exposing the callbacks.
vi.mock("./Project50View", () => ({
  Project50View: ({
    onStart,
    onRestart,
    onToggle,
    onAttachMedia,
    onSaveJournal,
  }: {
    onStart: () => void;
    onRestart: () => void;
    onToggle: (id: number, done: boolean) => void;
    onAttachMedia?: (objectKey: string, width: number, height: number) => void;
    onSaveJournal?: (wins: string, lessons: string, dayKey?: string) => Promise<void> | void;
  }) => (
    <div>
      <button data-testid="start" onClick={onStart}>start</button>
      <button data-testid="restart" onClick={onRestart}>restart</button>
      <button data-testid="toggle" onClick={() => onToggle(3, true)}>toggle</button>
      <button data-testid="attach" onClick={() => onAttachMedia?.("media/u/x.jpg", 800, 600)}>
        attach
      </button>
      <button
        data-testid="save-journal"
        onClick={() => onSaveJournal?.("won", "learned", "2026-06-02")}
      >
        save-journal
      </button>
    </div>
  ),
}));

import { Project50Client } from "./Project50Client";

const state = { status: "NONE" } as unknown as Project50State;

beforeEach(() => {
  trackMock.mockReset();
  startAction.mockReset();
  toggleAction.mockReset();
  attachAction.mockReset();
  saveJournalAction.mockReset();
  saveJournalAction.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("Project50Client instrumentation", () => {
  it("tracks project50_started (restarted:false) and starts on Start", () => {
    render(<Project50Client state={state} />);
    fireEvent.click(screen.getByTestId("start"));
    expect(trackMock).toHaveBeenCalledWith("project50_started", { restarted: false });
    expect(startAction).toHaveBeenCalledTimes(1);
  });

  it("tracks project50_started (restarted:true) on Restart", () => {
    render(<Project50Client state={state} />);
    fireEvent.click(screen.getByTestId("restart"));
    expect(trackMock).toHaveBeenCalledWith("project50_started", { restarted: true });
    expect(startAction).toHaveBeenCalledTimes(1);
  });

  it("tracks rule_toggled and toggles on Toggle", () => {
    render(<Project50Client state={state} />);
    fireEvent.click(screen.getByTestId("toggle"));
    expect(trackMock).toHaveBeenCalledWith("rule_toggled", { ruleId: 3, done: true });
    expect(toggleAction).toHaveBeenCalledWith(3, true);
  });

  it("tracks project50_photo_added and attaches the photo on Attach", () => {
    render(<Project50Client state={state} />);
    fireEvent.click(screen.getByTestId("attach"));
    expect(trackMock).toHaveBeenCalledWith("project50_photo_added", {});
    expect(attachAction).toHaveBeenCalledWith("media/u/x.jpg", 800, 600);
  });

  it("tracks project50_journal_saved and saves the journal on Save", () => {
    render(<Project50Client state={state} />);
    fireEvent.click(screen.getByTestId("save-journal"));
    expect(trackMock).toHaveBeenCalledWith("project50_journal_saved", {});
    expect(saveJournalAction).toHaveBeenCalledWith("won", "learned", "2026-06-02");
  });
});
