"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /**
   * Stable identity of the active day (e.g. `today.dayKey`). When it changes —
   * the dashboard revalidating past local midnight — the editor resyncs to the
   * new day so stale text never leaks across (or saves under) the wrong day.
   */
  dayKey?: string;
  /** Today's saved journal, if any — used to prefill the editor. */
  journal?: { wins: string; lessons: string };
  /**
   * Persist the current wins + lessons. Must resolve only once the save has
   * succeeded and reject if it fails — the "Saved" confirmation is gated on it.
   */
  onSave: (wins: string, lessons: string) => Promise<void>;
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 72,
  resize: "vertical",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--hairline)",
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "var(--font-body, system-ui)",
  fontSize: 14,
  lineHeight: 1.5,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  color: "var(--muted)",
  fontSize: 13,
  fontFamily: "var(--font-body, system-ui)",
};

/**
 * Per-day journal editor for the Project 50 check-in (rule #7 "Track progress").
 * Two labelled textareas — today's wins and what the user learned — with an
 * explicit Save button. The "✓ Saved" confirmation is shown ONLY after the save
 * resolves successfully; a rejected save surfaces an error instead. Prefilled
 * from `today.journal`; the confirmation/error clear on the next edit.
 */
export function DayJournalSection({ dayKey, journal, onSave }: Props) {
  const [wins, setWins] = useState(journal?.wins ?? "");
  const [lessons, setLessons] = useState(journal?.lessons ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  // Mirror the latest field values so a resolving save can compare against what
  // the user currently sees, even though the async continuation closes over the
  // values from when it started.
  const winsRef = useRef(wins);
  const lessonsRef = useRef(lessons);
  winsRef.current = wins;
  lessonsRef.current = lessons;

  // When the active day changes (e.g. the dashboard revalidates past local
  // midnight), resync the editor to the new day so the previous day's text
  // can't leak across — or be saved under — the wrong day. Unsaved edits for
  // the old day are intentionally discarded. Keyed on dayKey only so it does
  // not clobber the user's typing within the same day. `journal` is read but
  // intentionally excluded from deps: it's the new day's prefill, captured when
  // dayKey flips, not a trigger on its own.
  useEffect(() => {
    setWins(journal?.wins ?? "");
    setLessons(journal?.lessons ?? "");
    setSaved(false);
    setError(false);
  }, [dayKey]);

  function edit(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setter(e.target.value);
      setSaved(false);
      setError(false);
    };
  }

  async function handleSave() {
    // Snapshot the exact values submitted so we only confirm "Saved" if the
    // user hasn't changed either field while this (possibly slow) save is in
    // flight — otherwise we'd claim content was persisted that never was.
    const submittedWins = wins;
    const submittedLessons = lessons;
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      await onSave(submittedWins, submittedLessons);
      // Only confirm "Saved" if neither field was edited while the save was in
      // flight — otherwise the persisted content no longer matches what's shown.
      if (winsRef.current === submittedWins && lessonsRef.current === submittedLessons) {
        setSaved(true);
      }
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ margin: "28px 0 4px" }} aria-labelledby="day-journal-heading">
      <h2
        id="day-journal-heading"
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: 16,
          letterSpacing: "0.04em",
          margin: "0 0 12px",
        }}
      >
        Journal the day
      </h2>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="journal-wins" style={labelStyle}>
          Today&apos;s wins
        </label>
        <textarea
          id="journal-wins"
          data-testid="journal-wins"
          value={wins}
          onChange={edit(setWins)}
          placeholder="One thing that went well today…"
          style={textareaStyle}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="journal-lessons" style={labelStyle}>
          What I learned
        </label>
        <textarea
          id="journal-lessons"
          data-testid="journal-lessons"
          value={lessons}
          onChange={edit(setLessons)}
          placeholder="One lesson to carry into tomorrow…"
          style={textareaStyle}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="journal-save"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: "var(--accent)",
            color: "var(--bg)",
            fontFamily: "var(--font-body, system-ui)",
            fontWeight: 700,
            fontSize: 14,
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && !saving && (
          <span
            data-testid="journal-saved"
            role="status"
            style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}
          >
            ✓ Saved
          </span>
        )}
        {error && !saving && (
          <span
            data-testid="journal-error"
            role="alert"
            style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}
          >
            Couldn&apos;t save — try again.
          </span>
        )}
      </div>
    </section>
  );
}
