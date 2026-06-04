"use client";

import { useState } from "react";

interface Props {
  /** Today's saved journal, if any — used to prefill the editor. */
  journal?: { wins: string; lessons: string };
  /** Persist the current wins + lessons (server action round-trip). */
  onSave: (wins: string, lessons: string) => void;
  /** True while the save server action is in flight — disables the button. */
  pending?: boolean;
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
 * explicit Save button that shows a "Saved" confirmation. Prefilled from
 * `today.journal`; the confirmation clears on the next edit.
 */
export function DayJournalSection({ journal, onSave, pending = false }: Props) {
  const [wins, setWins] = useState(journal?.wins ?? "");
  const [lessons, setLessons] = useState(journal?.lessons ?? "");
  const [saved, setSaved] = useState(false);

  function edit(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setter(e.target.value);
      setSaved(false);
    };
  }

  function handleSave() {
    onSave(wins, lessons);
    setSaved(true);
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
          disabled={pending}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: "var(--accent)",
            color: "var(--bg)",
            fontFamily: "var(--font-body, system-ui)",
            fontWeight: 700,
            fontSize: 14,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && !pending && (
          <span
            data-testid="journal-saved"
            role="status"
            style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}
          >
            ✓ Saved
          </span>
        )}
      </div>
    </section>
  );
}
