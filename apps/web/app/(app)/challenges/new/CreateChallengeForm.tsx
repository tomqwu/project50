"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Label } from "@project50/ui";

export type GoalType = "TARGET" | "BINARY";
export type Visibility = "PUBLIC" | "FOLLOWERS" | "PRIVATE";

export interface CreateChallengeFormState {
  title: string;
  goalType: GoalType;
  unit: string;
  dailyTarget: string;
  startDate: string;
  timezone: string;
  visibility: Visibility;
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
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

export function CreateChallengeForm() {
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);
  const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [title, setTitle] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("TARGET");
  const [unit, setUnit] = useState("");
  const [dailyTarget, setDailyTarget] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

    // Client-side validation
    const clientErrors: string[] = [];
    if (!title.trim()) clientErrors.push("title is required");
    if (goalType === "TARGET") {
      if (!unit.trim()) clientErrors.push("unit is required");
      const target = Number(dailyTarget);
      if (!dailyTarget || isNaN(target) || target <= 0) {
        clientErrors.push("dailyTarget must be > 0");
      }
    }
    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);

    const body: Record<string, unknown> = {
      title: title.trim(),
      goalType,
      startDate,
      timezone,
      visibility,
    };

    if (goalType === "TARGET") {
      body.unit = unit.trim();
      body.dailyTarget = Number(dailyTarget);
    }

    try {
      const res = await fetch("/api/challenges", {
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
        New Challenge
      </h1>

      {/* Title */}
      <div>
        <Label>Title</Label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="title-input"
          placeholder="e.g. Run 5K daily"
          style={inputStyle}
        />
      </div>

      {/* Goal type */}
      <div>
        <Label>Goal type</Label>
        <div
          style={{ display: "flex", gap: "12px", marginTop: "10px" }}
          data-testid="goaltype-group"
        >
          {(["TARGET", "BINARY"] as GoalType[]).map((gt) => (
            <label
              key={gt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "var(--font-body, system-ui)",
                fontSize: "15px",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="goalType"
                value={gt}
                checked={goalType === gt}
                onChange={() => setGoalType(gt)}
                data-testid={`goaltype-${gt.toLowerCase()}`}
              />
              {gt === "TARGET" ? "Target (track amount)" : "Binary (done/not done)"}
            </label>
          ))}
        </div>
      </div>

      {/* TARGET-only fields */}
      {goalType === "TARGET" && (
        <>
          <div>
            <Label>Unit</Label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              data-testid="unit-input"
              placeholder="e.g. km, min, pages"
              style={inputStyle}
            />
          </div>
          <div>
            <Label>Daily target</Label>
            <input
              type="number"
              min="0"
              step="any"
              value={dailyTarget}
              onChange={(e) => setDailyTarget(e.target.value)}
              data-testid="daily-target-input"
              placeholder="e.g. 5"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* Start date */}
      <div>
        <Label>Start date</Label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          data-testid="start-date-input"
          style={inputStyle}
        />
      </div>

      {/* Timezone */}
      <div>
        <Label>Timezone</Label>
        <input
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          data-testid="timezone-input"
          style={inputStyle}
        />
      </div>

      {/* Visibility */}
      <div>
        <Label>Visibility</Label>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
          data-testid="visibility-select"
          style={selectStyle}
        >
          <option value="PUBLIC">Public</option>
          <option value="FOLLOWERS">Followers only</option>
          <option value="PRIVATE">Private</option>
        </select>
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
        {submitting ? "Creating…" : "Create challenge"}
      </Button>
    </form>
  );
}
