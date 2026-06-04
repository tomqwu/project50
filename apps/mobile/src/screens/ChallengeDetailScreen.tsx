/**
 * ChallengeDetailScreen — view, edit, and delete a custom plan (challenge).
 *
 * Loads the challenge via apiClient.getChallenge. Shows title, goal, schedule,
 * and streak stats. Editing toggles an inline form (title, dailyTarget, unit,
 * visibility) that PATCHes via apiClient.updateChallenge. Delete prompts a
 * confirmation then calls apiClient.deleteChallenge.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { apiClient } from "../lib/apiClient";
import type { ChallengeDetail } from "../lib/apiClient";
import { colors } from "../theme";
import { elevation, ripple } from "../components/platform";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ChallengeDetailScreenProps {
  challengeId: string;
  /** Called after a successful delete. */
  onDeleted?: () => void;
}

const VISIBILITIES: ReadonlyArray<{
  value: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
  label: string;
}> = [
  { value: "PUBLIC", label: "Public" },
  { value: "FOLLOWERS", label: "Followers" },
  { value: "PRIVATE", label: "Private" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ChallengeDetailScreen(
  props: ChallengeDetailScreenProps,
): React.JSX.Element {
  const { challengeId, onDeleted } = props;

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // Edit form state
  const [title, setTitle] = useState("");
  const [dailyTarget, setDailyTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [visibility, setVisibility] = useState<
    "PUBLIC" | "FOLLOWERS" | "PRIVATE"
  >("PRIVATE");

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        setLoading(true);
        setError(null);
        const detail = await apiClient.getChallenge(challengeId);
        /* istanbul ignore else — cancellation guard when component unmounts mid-flight */
        if (!cancelled) {
          setChallenge(detail);
          setLoading(false);
        }
      } catch (e) {
        /* istanbul ignore else — cancellation guard when component unmounts mid-flight */
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load plan");
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  const startEdit = (): void => {
    /* istanbul ignore next — guarded by render: edit button only shows when challenge is set */
    if (!challenge) return;
    setTitle(challenge.title);
    setDailyTarget(challenge.dailyTarget != null ? String(challenge.dailyTarget) : "");
    setUnit(challenge.unit ?? "");
    setVisibility(challenge.visibility);
    setError(null);
    setEditing(true);
  };

  const handleSave = async (): Promise<void> => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const updated = await apiClient.updateChallenge(challengeId, {
        title: trimmedTitle,
        dailyTarget:
          challenge?.goalType === "TARGET" && dailyTarget
            ? Number(dailyTarget)
            : undefined,
        unit:
          challenge?.goalType === "TARGET" && unit.trim() ? unit.trim() : undefined,
        visibility,
      });
      // prev is always set here: save is only reachable from the loaded edit view.
      setChallenge((prev) => ({ ...(prev as ChallengeDetail), ...updated }));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save plan");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.deleteChallenge(challengeId);
      setDeleted(true);
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete plan");
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  };

  // ─── Render: loading / error / deleted ──────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center} testID="detail-loading">
        <ActivityIndicator color={colors.volt} size="large" />
      </View>
    );
  }

  if (deleted) {
    return (
      <View style={styles.center} testID="detail-deleted">
        <Text style={styles.successText}>Plan deleted.</Text>
      </View>
    );
  }

  if (error && !challenge) {
    return (
      <View style={styles.center} testID="detail-error">
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      </View>
    );
  }

  /* istanbul ignore next — challenge is always set past loading/error guards */
  if (!challenge) {
    return (
      <View style={styles.center} testID="detail-empty">
        <Text style={styles.errorText}>Plan not found.</Text>
      </View>
    );
  }

  // ─── Render: edit form ──────────────────────────────────────────────────────

  if (editing) {
    return (
      <ScrollView style={styles.container} testID="detail-edit">
        <Text style={styles.heading} accessibilityRole="header">
          Edit plan
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label} nativeID="edit-title-label">
            Title
          </Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholderTextColor="#666"
            testID="edit-title-input"
            accessibilityLabel="Title"
            accessibilityLabelledBy="edit-title-label"
          />
        </View>

        {challenge.goalType === "TARGET" && (
          <View style={styles.fieldGroup} testID="edit-target-fields">
            <Text style={styles.label} nativeID="edit-target-label">
              Daily target
            </Text>
            <TextInput
              style={styles.input}
              value={dailyTarget}
              onChangeText={setDailyTarget}
              keyboardType="decimal-pad"
              placeholderTextColor="#666"
              testID="edit-daily-target-input"
              accessibilityLabel="Daily target"
              accessibilityLabelledBy="edit-target-label"
            />
            <Text
              style={[styles.label, styles.labelSpaced]}
              nativeID="edit-unit-label"
            >
              Unit
            </Text>
            <TextInput
              style={styles.input}
              value={unit}
              onChangeText={setUnit}
              placeholderTextColor="#666"
              testID="edit-unit-input"
              accessibilityLabel="Unit"
              accessibilityLabelledBy="edit-unit-label"
            />
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Visibility</Text>
          <View
            style={styles.segmentRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="Visibility"
          >
            {VISIBILITIES.map((v) => (
              <Pressable
                key={v.value}
                style={[
                  styles.segment,
                  visibility === v.value && styles.segmentActive,
                ]}
                onPress={() => setVisibility(v.value)}
                testID={`edit-visibility-${v.value}`}
                android_ripple={ripple()}
                accessibilityRole="radio"
                accessibilityState={{ selected: visibility === v.value }}
                accessibilityLabel={v.label}
              >
                <Text
                  style={[
                    styles.segmentText,
                    visibility === v.value && styles.segmentTextActive,
                  ]}
                >
                  {v.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {error && (
          <View
            style={styles.errorContainer}
            testID="edit-error"
            accessibilityRole="alert"
          >
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[styles.submitButton, busy && styles.submitButtonDisabled]}
          onPress={() => {
            void handleSave();
          }}
          disabled={busy}
          testID="save-button"
          android_ripple={ripple("rgba(18, 16, 19, 0.2)")}
          accessibilityRole="button"
          accessibilityLabel={busy ? "Saving plan" : "Save"}
          accessibilityState={{ disabled: busy, busy }}
        >
          <Text style={styles.submitText}>{busy ? "Saving..." : "Save"}</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => {
            setEditing(false);
            setError(null);
          }}
          disabled={busy}
          testID="cancel-edit-button"
          android_ripple={ripple()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          accessibilityState={{ disabled: busy }}
        >
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ─── Render: detail view ────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} testID="detail-content">
      <Text style={styles.title} testID="detail-title" accessibilityRole="header">
        {challenge.title}
      </Text>

      <Text style={styles.meta} testID="detail-goal">
        {challenge.goalType === "TARGET"
          ? `Target: ${challenge.dailyTarget ?? 0} ${challenge.unit ?? ""}`.trim()
          : "Done / Not done"}
      </Text>

      <Text style={styles.meta} testID="detail-schedule">
        {`Starts ${challenge.startDate} · ${challenge.lengthDays} days`}
      </Text>

      <Text style={styles.meta} testID="detail-visibility">
        {`Visibility: ${challenge.visibility}`}
      </Text>

      <View style={styles.statsRow}>
        <View
          style={styles.statBox}
          accessible
          accessibilityLabel={`Streak: ${challenge.currentStreak}`}
        >
          <Text style={styles.statValue} testID="detail-streak">
            {challenge.currentStreak}
          </Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View
          style={styles.statBox}
          accessible
          accessibilityLabel={`Best streak: ${challenge.longestStreak}`}
        >
          <Text style={styles.statValue} testID="detail-longest">
            {challenge.longestStreak}
          </Text>
          <Text style={styles.statLabel}>Best</Text>
        </View>
        <View
          style={styles.statBox}
          accessible
          accessibilityLabel={`Badges: ${challenge.badges}`}
        >
          <Text style={styles.statValue} testID="detail-badges">
            {challenge.badges}
          </Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
      </View>

      {error && (
        <View
          style={styles.errorContainer}
          testID="detail-action-error"
          accessibilityRole="alert"
        >
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        style={styles.submitButton}
        onPress={startEdit}
        testID="edit-button"
        android_ripple={ripple("rgba(18, 16, 19, 0.2)")}
        accessibilityRole="button"
        accessibilityLabel="Edit plan"
      >
        <Text style={styles.submitText}>Edit plan</Text>
      </Pressable>

      {confirmingDelete ? (
        <View testID="delete-confirm">
          <Text style={styles.confirmText} accessibilityRole="alert">
            Delete this plan permanently?
          </Text>
          <Pressable
            style={[styles.dangerButton, busy && styles.submitButtonDisabled]}
            onPress={() => {
              void handleDelete();
            }}
            disabled={busy}
            testID="confirm-delete-button"
            android_ripple={ripple("rgba(255, 107, 107, 0.2)")}
            accessibilityRole="button"
            accessibilityLabel={busy ? "Deleting plan" : "Yes, delete"}
            accessibilityState={{ disabled: busy, busy }}
          >
            <Text style={styles.dangerText}>
              {busy ? "Deleting..." : "Yes, delete"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setConfirmingDelete(false)}
            disabled={busy}
            testID="cancel-delete-button"
            android_ripple={ripple()}
            accessibilityRole="button"
            accessibilityLabel="Keep plan"
            accessibilityState={{ disabled: busy }}
          >
            <Text style={styles.secondaryText}>Keep plan</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={styles.dangerButton}
          onPress={() => setConfirmingDelete(true)}
          testID="delete-button"
          android_ripple={ripple("rgba(255, 107, 107, 0.2)")}
          accessibilityRole="button"
          accessibilityLabel="Delete plan"
        >
          <Text style={styles.dangerText}>Delete plan</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.charcoal,
    padding: 16,
  },
  center: {
    flex: 1,
    backgroundColor: colors.charcoal,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 24,
    marginTop: 16,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  meta: {
    color: colors.text,
    fontSize: 15,
    opacity: 0.85,
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
    marginBottom: 24,
  },
  statBox: {
    alignItems: "center",
  },
  statValue: {
    color: colors.volt,
    fontSize: 24,
    fontWeight: "bold",
  },
  statLabel: {
    color: colors.text,
    fontSize: 12,
    opacity: 0.7,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 8,
    opacity: 0.8,
  },
  labelSpaced: {
    marginTop: 16,
  },
  input: {
    backgroundColor: "#1e1e1e",
    color: colors.text,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#333",
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  segment: {
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 8,
    marginBottom: 8,
    minHeight: 44,
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#333",
  },
  segmentActive: {
    borderColor: colors.volt,
    backgroundColor: "#1e2a00",
  },
  segmentText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: colors.volt,
  },
  errorContainer: {
    backgroundColor: "#2a0000",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 14,
    textAlign: "center",
  },
  confirmText: {
    color: colors.text,
    fontSize: 15,
    marginBottom: 12,
    textAlign: "center",
  },
  submitButton: {
    backgroundColor: colors.volt,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    overflow: "hidden",
    marginBottom: 12,
    ...elevation(2),
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: colors.charcoal,
    fontSize: 16,
    fontWeight: "bold",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#555",
    marginBottom: 32,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  dangerButton: {
    backgroundColor: "transparent",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ff6b6b",
    marginBottom: 12,
  },
  dangerText: {
    color: "#ff6b6b",
    fontSize: 15,
    fontWeight: "600",
  },
  successText: {
    color: colors.volt,
    fontSize: 22,
    fontWeight: "bold",
  },
});
