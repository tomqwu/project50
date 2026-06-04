"use client";

import { useState } from "react";
import { Button, Label } from "@project50/ui";
import { updateNotificationPrefsAction } from "../actions";
import type { NotificationPrefs } from "@/lib/api/notification-prefs";

const selectStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "14px 16px",
  marginTop: "8px",
  borderRadius: "12px",
  border: "1px solid var(--hairline)",
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "var(--font-body, system-ui)",
  fontSize: "16px",
  boxSizing: "border-box",
};

/** Map a server/validation error code to a human-friendly message. */
function errorMessage(code: string): string {
  switch (code) {
    case "invalid_quiet_hours":
      return "Quiet hours must be whole hours between 0 and 23.";
    default:
      return code;
  }
}

/** "Off" sentinel for the hour <select>s, distinct from hour 0. */
const OFF = "";

/** Format an hour (0-23) as a readable label, e.g. "22:00". */
function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Notifications settings (#122). Lets the signed-in user turn email reminders
 * on/off and choose an optional quiet-hours window during which reminders are
 * suppressed. Both quiet-hours selects must be set together to form a window;
 * setting either to "Off" clears the window.
 */
export function NotificationPrefsSection({
  initial,
}: {
  initial: NotificationPrefs;
}) {
  const [remindersEnabled, setRemindersEnabled] = useState(
    initial.remindersEnabled,
  );
  const [start, setStart] = useState<string>(
    initial.quietHoursStart === null ? OFF : String(initial.quietHoursStart),
  );
  const [end, setEnd] = useState<string>(
    initial.quietHoursEnd === null ? OFF : String(initial.quietHoursEnd),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // A window needs both bounds; if either is "Off", clear the whole window.
    const bothSet = start !== OFF && end !== OFF;
    const quietHoursStart = bothSet ? Number(start) : null;
    const quietHoursEnd = bothSet ? Number(end) : null;

    setSaving(true);
    try {
      const result = await updateNotificationPrefsAction({
        remindersEnabled,
        quietHoursStart,
        quietHoursEnd,
      });
      if (result.ok) {
        setRemindersEnabled(result.prefs.remindersEnabled);
        setStart(
          result.prefs.quietHoursStart === null
            ? OFF
            : String(result.prefs.quietHoursStart),
        );
        setEnd(
          result.prefs.quietHoursEnd === null
            ? OFF
            : String(result.prefs.quietHoursEnd),
        );
        setSuccess(true);
      } else {
        setError(errorMessage(result.error));
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="notification-prefs-section"
      style={{
        padding: "24px 32px",
        maxWidth: "480px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "20px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--text)",
          margin: 0,
        }}
      >
        Notifications
      </h2>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontFamily: "var(--font-body, system-ui)",
          fontSize: "16px",
          color: "var(--text)",
        }}
      >
        <input
          type="checkbox"
          checked={remindersEnabled}
          onChange={(e) => setRemindersEnabled(e.target.checked)}
          data-testid="reminders-enabled-input"
        />
        Email me daily reminders
      </label>

      <div>
        <Label>Quiet hours (no reminders during this window)</Label>
        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <select
            value={start}
            onChange={(e) => setStart(e.target.value)}
            data-testid="quiet-start-input"
            aria-label="Quiet hours start"
            style={selectStyle}
          >
            <option value={OFF}>Off</option>
            {HOURS.map((h) => (
              <option key={h} value={String(h)}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <select
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            data-testid="quiet-end-input"
            aria-label="Quiet hours end"
            style={selectStyle}
          >
            <option value={OFF}>Off</option>
            {HOURS.map((h) => (
              <option key={h} value={String(h)}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p
          data-testid="notification-prefs-error"
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(229,72,77,0.12)",
            border: "1px solid rgba(229,72,77,0.3)",
            color: "var(--danger)",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
            margin: 0,
          }}
        >
          {error}
        </p>
      )}

      {success && (
        <p
          data-testid="notification-prefs-success"
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(48,164,108,0.12)",
            border: "1px solid rgba(48,164,108,0.3)",
            color: "var(--accent)",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
            margin: 0,
          }}
        >
          Saved.
        </p>
      )}

      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
