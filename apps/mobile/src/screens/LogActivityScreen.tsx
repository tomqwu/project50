/**
 * LogActivityScreen — log a challenge activity with optional photo.
 * Supports TARGET (amount) and BINARY (done checkbox) goal types.
 * Includes note, mood (1-5), photo capture/library (pickImage → uploadPhoto), and submit.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
} from "react-native";
import { apiClient } from "../lib/apiClient";
import type { GoalType } from "@project50/core";
import { pickImageFromCamera, pickImageFromLibrary, uploadPhoto } from "../lib/photo";
import type { PickedImage } from "../lib/photo";
import { colors } from "../theme";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LogActivityScreenProps {
  challengeId: string;
  goalType: GoalType;
  dailyTarget?: number;
  unit?: string;
  dayKey: string;
  onSuccess?: () => void;
}

// ─── Mood chips ───────────────────────────────────────────────────────────────

const MOODS = [1, 2, 3, 4, 5] as const;
const MOOD_LABELS: Record<number, string> = {
  1: "😞",
  2: "😐",
  3: "🙂",
  4: "😊",
  5: "🎉",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function LogActivityScreen(props: LogActivityScreenProps): React.JSX.Element {
  const { challengeId, goalType, dailyTarget, unit, dayKey, onSuccess } = props;

  // Form state
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [photo, setPhoto] = useState<PickedImage | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);

  // ─── Photo handlers ────────────────────────────────────────────────────────

  const pickPhotoWith = async (
    pick: () => Promise<PickedImage | null>,
  ): Promise<void> => {
    try {
      const picked = await pick();
      if (picked) {
        setPhoto(picked);
      }
    } catch (e) {
      Alert.alert("Photo error", e instanceof Error ? e.message : "Could not pick photo");
    }
  };

  const handleAddPhoto = (): Promise<void> => pickPhotoWith(pickImageFromLibrary);
  const handleTakePhoto = (): Promise<void> => pickPhotoWith(pickImageFromCamera);

  // ─── Submit handler ────────────────────────────────────────────────────────

  const handleSubmit = async (): Promise<void> => {
    setSubmitting(true);
    setErrors([]);

    try {
      // Upload photo if one was selected
      let media: Array<{ objectKey: string; width: number; height: number }> | undefined;
      if (photo) {
        const ext = photo.mimeType === "image/png" ? "png" : "jpg";
        const uploaded = await uploadPhoto(
          apiClient,
          photo.uri,
          photo.mimeType,
          ext,
          `activity-${dayKey}`,
          photo.width,
          photo.height,
        );
        media = [uploaded];
      }

      // Submit the activity
      await apiClient.logActivity(challengeId, {
        dayKey,
        amount: goalType === "TARGET" ? (amount ? Number(amount) : undefined) : undefined,
        done: goalType === "BINARY" ? done : undefined,
        note: note.trim() || undefined,
        mood: mood ?? undefined,
        media,
      });

      setSuccess(true);
      onSuccess?.();
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
        setErrors([e instanceof Error ? e.message : "Failed to log activity"]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (success) {
    return (
      <View style={styles.center} testID="log-success">
        <Text style={styles.successText}>Activity logged!</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="log-screen">
      {/* Activity type header */}
      <Text style={styles.heading} testID="log-heading">
        {`Log ${goalType === "TARGET" ? `${unit ?? "progress"}` : "activity"}`}
      </Text>

      {/* TARGET: amount input */}
      {goalType === "TARGET" && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            {`Amount${unit ? ` (${unit})` : ""}`}
          </Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={`Target: ${dailyTarget ?? 0}`}
            placeholderTextColor="#666"
            testID="amount-input"
          />
        </View>
      )}

      {/* BINARY: done toggle */}
      {goalType === "BINARY" && (
        <View style={styles.fieldGroup}>
          <TouchableOpacity
            style={[styles.doneButton, done && styles.doneButtonActive]}
            onPress={() => setDone((prev) => !prev)}
            testID="done-toggle"
          >
            <Text style={[styles.doneButtonText, done && styles.doneButtonTextActive]}>
              {done ? "Done!" : "Mark as done"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Note */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Note (optional)</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          placeholder="How did it go?"
          placeholderTextColor="#666"
          multiline
          testID="note-input"
        />
      </View>

      {/* Mood */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Mood (optional)</Text>
        <View style={styles.moodRow}>
          {MOODS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.moodChip, mood === m && styles.moodChipActive]}
              onPress={() => setMood((prev) => (prev === m ? null : m))}
              testID={`mood-${m}`}
            >
              <Text style={styles.moodEmoji}>{MOOD_LABELS[m]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Photo */}
      <View style={styles.fieldGroup}>
        <View style={styles.photoButtonsRow}>
          <TouchableOpacity
            style={[styles.photoButton, styles.photoButtonFlex]}
            onPress={() => { void handleTakePhoto(); }}
            testID="take-photo-button"
          >
            <Text style={styles.photoButtonText}>
              {photo ? "Retake photo" : "Take photo"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.photoButton, styles.photoButtonFlex]}
            onPress={() => { void handleAddPhoto(); }}
            testID="add-photo-button"
          >
            <Text style={styles.photoButtonText}>
              {photo ? "Change photo" : "Add photo"}
            </Text>
          </TouchableOpacity>
        </View>
        {photo && (
          <Image
            source={{ uri: photo.uri }}
            style={styles.photoPreview}
            testID="photo-preview"
          />
        )}
      </View>

      {/* Errors */}
      {errors.length > 0 && (
        <View style={styles.errorContainer} testID="errors-container">
          {errors.map((err, i) => (
            <Text key={i} style={styles.errorText} testID={`error-${i}`}>
              {err}
            </Text>
          ))}
        </View>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={() => { void handleSubmit(); }}
        disabled={submitting}
        testID="submit-button"
      >
        <Text style={styles.submitText}>
          {submitting ? "Logging..." : "Log Activity"}
        </Text>
      </TouchableOpacity>
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
  input: {
    backgroundColor: "#1e1e1e",
    color: colors.text,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  doneButton: {
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  doneButtonActive: {
    borderColor: colors.volt,
    backgroundColor: "#1e2a00",
  },
  doneButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  doneButtonTextActive: {
    color: colors.volt,
  },
  moodRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  moodChip: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1e1e1e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  moodChipActive: {
    borderColor: colors.volt,
    backgroundColor: "#1e2a00",
  },
  moodEmoji: {
    fontSize: 24,
  },
  photoButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  photoButton: {
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
  },
  photoButtonFlex: {
    flex: 1,
  },
  photoButtonText: {
    color: colors.volt,
    fontSize: 14,
    fontWeight: "600",
  },
  photoPreview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginTop: 8,
    resizeMode: "cover",
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
    marginBottom: 32,
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
  },
});
