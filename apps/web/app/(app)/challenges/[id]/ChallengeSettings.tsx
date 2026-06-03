"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Label } from "@project50/ui";

export type Visibility = "PUBLIC" | "FOLLOWERS" | "PRIVATE";

export interface ChallengeSettingsProps {
  id: string;
  title: string;
  goalType: "TARGET" | "BINARY";
  unit: string | null;
  dailyTarget: number | null;
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

export function ChallengeSettings({
  id,
  title: initialTitle,
  goalType,
  unit: initialUnit,
  dailyTarget: initialDailyTarget,
  visibility: initialVisibility,
}: ChallengeSettingsProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [unit, setUnit] = useState(initialUnit ?? "");
  const [dailyTarget, setDailyTarget] = useState(
    initialDailyTarget != null ? String(initialDailyTarget) : "",
  );
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

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

    setSaving(true);

    const body: Record<string, unknown> = {
      title: title.trim(),
      visibility,
    };
    if (goalType === "TARGET") {
      body.unit = unit.trim();
      body.dailyTarget = Number(dailyTarget);
    }

    try {
      const res = await fetch(`/api/challenges/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.refresh();
        return;
      }

      if (res.status === 422) {
        const data = await res.json();
        const detail: string[] = Array.isArray(data?.detail)
          ? data.detail
          : typeof data?.detail === "string"
            ? [data.detail]
            : [data?.error ?? "Validation error"];
        setErrors(detail);
      } else {
        setErrors(["Something went wrong. Please try again."]);
      }
    } catch {
      setErrors(["Network error. Please try again."]);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setErrors([]);
    setDeleting(true);
    try {
      const res = await fetch(`/api/challenges/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/");
        return;
      }
      setErrors(["Could not delete this challenge. Please try again."]);
    } catch {
      setErrors(["Network error. Please try again."]);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      data-testid="challenge-settings"
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
        Edit Challenge
      </h1>

      <div>
        <Label>Title</Label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="title-input"
          style={inputStyle}
        />
      </div>

      {goalType === "TARGET" && (
        <>
          <div>
            <Label>Unit</Label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              data-testid="unit-input"
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
              style={inputStyle}
            />
          </div>
        </>
      )}

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

      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>

      <div
        style={{
          marginTop: "8px",
          paddingTop: "24px",
          borderTop: "1px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {!confirmingDelete ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete challenge
          </Button>
        ) : (
          <div
            data-testid="delete-confirm"
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <p
              style={{
                fontFamily: "var(--font-body, system-ui)",
                color: "var(--text)",
                fontSize: "14px",
                margin: 0,
              }}
            >
              This permanently deletes the challenge and all its activity. Are
              you sure?
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <Button
                type="button"
                variant="danger"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
