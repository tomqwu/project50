/**
 * CreateChallengeScreen — create a custom plan (challenge).
 *
 * Form fields:
 * - title (required)
 * - goalType: TARGET | BINARY (segmented toggle)
 * - dailyTarget + unit (TARGET only)
 * - startDate (text, defaults to today's local day key)
 * - visibility: PUBLIC | FOLLOWERS | PRIVATE (segmented toggle)
 *
 * Calls apiClient.createChallenge and reports the created challenge via onCreated.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { apiClient } from "../lib/apiClient";
import type { Challenge, GoalType } from "../lib/apiClient";
import { localDayKey } from "@project50/core";
import { colors } from "../theme";
import { elevation, ripple } from "../components/platform";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CreateChallengeScreenProps {
  /** Called with the created challenge after a successful submit. */
  onCreated?: (challenge: Challenge) => void;
}

// ─── Option constants ───────────────────────────────────────────────────────────

const GOAL_TYPES: ReadonlyArray<{ value: GoalType; label: string }> = [
  { value: "TARGET", label: "Target" },
  { value: "BINARY", label: "Done / Not done" },
];

const VISIBILITIES: ReadonlyArray<{
  value: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
  label: string;
}> = [
  { value: "PUBLIC", label: "Public" },
  { value: "FOLLOWERS", label: "Followers" },
  { value: "PRIVATE", label: "Private" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateChallengeScreen(
  props: CreateChallengeScreenProps,
): React.JSX.Element {
  const { onCreated } = props;

  const [title, setTitle] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("TARGET");
  const [dailyTarget, setDailyTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [startDate, setStartDate] = useState(() => localDayKey(new Date(), "UTC"));
  const [visibility, setVisibility] = useState<
    "PUBLIC" | "FOLLOWERS" | "PRIVATE"
  >("PRIVATE");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [created, setCreated] = useState<Challenge | null>(null);

  const handleSubmit = async (): Promise<void> => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrors(["Title is required."]);
      return;
    }

    setSubmitting(true);
    setErrors([]);

    try {
      const challenge = await apiClient.createChallenge({
        title: trimmedTitle,
        goalType,
        dailyTarget:
          goalType === "TARGET" && dailyTarget ? Number(dailyTarget) : undefined,
        unit: goalType === "TARGET" && unit.trim() ? unit.trim() : undefined,
        startDate,
        visibility,
      });

      setCreated(challenge);
      onCreated?.(challenge);
    } catch (e) {
      if (e instanceof Error && e.message.includes("422")) {
        setErrors(["Validation failed. Please check your input."]);
      } else if (
        typeof e === "object" &&
        e !== null &&
        "status" in e &&
        (e as { status: number }).status === 422
      ) {
        setErrors(["Validation failed. Please check your input."]);
      } else {
        setErrors([e instanceof Error ? e.message : "Failed to create plan"]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success state ──────────────────────────────────────────────────────────

  if (created) {
    return (
      <View style={styles.center} testID="create-success">
        <Text style={styles.successText} accessibilityRole="header">
          Plan created!
        </Text>
        <Text style={styles.successTitle} testID="created-title">
          {created.title}
        </Text>
      </View>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} testID="create-screen">
      <Text style={styles.heading} testID="create-heading" accessibilityRole="header">
        Create custom plan
      </Text>

      {/* Title */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label} nativeID="create-title-label">
          Title
        </Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Read 20 pages"
          placeholderTextColor="#666"
          testID="title-input"
          accessibilityLabel="Title"
          accessibilityLabelledBy="create-title-label"
        />
      </View>

      {/* Goal type */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Goal type</Text>
        <View
          style={styles.segmentRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Goal type"
        >
          {GOAL_TYPES.map((g) => (
            <Pressable
              key={g.value}
              style={[
                styles.segment,
                goalType === g.value && styles.segmentActive,
              ]}
              onPress={() => setGoalType(g.value)}
              testID={`goal-${g.value}`}
              android_ripple={ripple()}
              accessibilityRole="radio"
              accessibilityState={{ selected: goalType === g.value }}
              accessibilityLabel={g.label}
            >
              <Text
                style={[
                  styles.segmentText,
                  goalType === g.value && styles.segmentTextActive,
                ]}
              >
                {g.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* TARGET: dailyTarget + unit */}
      {goalType === "TARGET" && (
        <View style={styles.fieldGroup} testID="target-fields">
          <Text style={styles.label} nativeID="create-target-label">
            Daily target
          </Text>
          <TextInput
            style={styles.input}
            value={dailyTarget}
            onChangeText={setDailyTarget}
            keyboardType="decimal-pad"
            placeholder="e.g. 5"
            placeholderTextColor="#666"
            testID="daily-target-input"
            accessibilityLabel="Daily target"
            accessibilityLabelledBy="create-target-label"
          />
          <Text
            style={[styles.label, styles.labelSpaced]}
            nativeID="create-unit-label"
          >
            Unit
          </Text>
          <TextInput
            style={styles.input}
            value={unit}
            onChangeText={setUnit}
            placeholder="e.g. km, pages, minutes"
            placeholderTextColor="#666"
            testID="unit-input"
            accessibilityLabel="Unit"
            accessibilityLabelledBy="create-unit-label"
          />
        </View>
      )}

      {/* Start date */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label} nativeID="create-start-label">
          Start date (YYYY-MM-DD)
        </Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="2026-01-01"
          placeholderTextColor="#666"
          autoCapitalize="none"
          testID="start-date-input"
          accessibilityLabel="Start date"
          accessibilityLabelledBy="create-start-label"
        />
      </View>

      {/* Visibility */}
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
              testID={`visibility-${v.value}`}
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

      {/* Errors */}
      {errors.length > 0 && (
        <View
          style={styles.errorContainer}
          testID="errors-container"
          accessibilityRole="alert"
        >
          {errors.map((err, i) => (
            <Text key={i} style={styles.errorText} testID={`error-${i}`}>
              {err}
            </Text>
          ))}
        </View>
      )}

      {/* Submit */}
      <Pressable
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={() => {
          void handleSubmit();
        }}
        disabled={submitting}
        testID="submit-button"
        android_ripple={ripple("rgba(18, 16, 19, 0.2)")}
        accessibilityRole="button"
        accessibilityLabel={submitting ? "Creating plan" : "Create plan"}
        accessibilityState={{ disabled: submitting, busy: submitting }}
      >
        <Text style={styles.submitText}>
          {submitting ? "Creating..." : "Create plan"}
        </Text>
      </Pressable>
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
  },
  submitButton: {
    backgroundColor: colors.volt,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    overflow: "hidden",
    marginBottom: 32,
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
  successText: {
    color: colors.volt,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  successTitle: {
    color: colors.text,
    fontSize: 18,
  },
});
