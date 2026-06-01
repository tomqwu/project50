"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Label } from "@project50/ui";

const ACTIVITY_TYPES = ["Run", "Bike", "Gym", "Yoga"] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface LogActivityFormProps {
  challengeId: string;
  goalType: "TARGET" | "BINARY";
  unit?: string | null;
}

export function LogActivityForm({ challengeId, goalType, unit }: LogActivityFormProps) {
  const router = useRouter();

  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      dayKey: new Date().toISOString().slice(0, 10),
      activityType: activityType ?? undefined,
      note: note || undefined,
      mood: mood ?? undefined,
    };

    if (goalType === "TARGET") {
      body.amount = amount ? Number(amount) : undefined;
    } else {
      body.done = done;
    }

    try {
      const res = await fetch(`/api/challenges/${challengeId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push("/");
        return;
      }

      if (res.status === 422) {
        const data = await res.json();
        const detail: string[] = Array.isArray(data?.detail)
          ? data.detail
          : typeof data?.detail === "string"
            ? [data.detail]
            : [data?.code ?? "Validation error"];
        setErrors(detail);
      } else {
        setErrors(["Something went wrong. Please try again."]);
      }
    } catch {
      setErrors(["Network error. Please try again."]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: "32px",
        maxWidth: "480px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "28px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--text)",
          margin: 0,
        }}
      >
        Log Activity
      </h1>

      {/* Activity type chips */}
      <div>
        <Label>Activity type</Label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
          {ACTIVITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setActivityType(type === activityType ? null : type)}
              data-testid={`chip-${type.toLowerCase()}`}
              aria-pressed={activityType === type}
              style={{
                padding: "8px 16px",
                borderRadius: "999px",
                border: "1px solid var(--hairline)",
                background: activityType === type ? "var(--accent)" : "var(--card)",
                color: activityType === type ? "var(--bg)" : "var(--text)",
                fontFamily: "var(--font-body, system-ui)",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Amount (TARGET) or Done toggle (BINARY) */}
      {goalType === "TARGET" ? (
        <div>
          <Label>{`Amount${unit ? ` (${unit})` : ""}`}</Label>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="amount-input"
            placeholder="0"
            style={inputStyle}
          />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input
            type="checkbox"
            id="done-toggle"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            data-testid="done-toggle"
            style={{ width: "20px", height: "20px", cursor: "pointer" }}
          />
          <label
            htmlFor="done-toggle"
            style={{ fontFamily: "var(--font-body, system-ui)", color: "var(--text)", cursor: "pointer" }}
          >
            Mark as done
          </label>
        </div>
      )}

      {/* Note */}
      <div>
        <Label>Note (optional)</Label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid="note-input"
          rows={3}
          placeholder="How did it feel?"
          style={{ ...inputStyle, resize: "vertical", minHeight: "72px" }}
        />
      </div>

      {/* Mood 1–5 */}
      <div>
        <Label>Mood</Label>
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          {[1, 2, 3, 4, 5].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(m === mood ? null : m)}
              data-testid={`mood-${m}`}
              aria-pressed={mood === m}
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                border: "1px solid var(--hairline)",
                background: mood === m ? "var(--accent)" : "var(--card)",
                color: mood === m ? "var(--bg)" : "var(--text)",
                fontFamily: "var(--font-display, 'Anton', sans-serif)",
                fontSize: "16px",
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Inline validation errors */}
      {errors.length > 0 && (
        <ul
          data-testid="form-errors"
          style={{
            listStyle: "none",
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(229,72,77,0.12)",
            border: "1px solid rgba(229,72,77,0.3)",
            margin: 0,
          }}
        >
          {errors.map((err, i) => (
            <li
              key={i}
              style={{
                fontFamily: "var(--font-body, system-ui)",
                color: "var(--danger)",
                fontSize: "14px",
              }}
            >
              {err}
            </li>
          ))}
        </ul>
      )}

      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Logging…" : "Log activity"}
      </Button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
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
};
