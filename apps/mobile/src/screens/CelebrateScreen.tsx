/**
 * CelebrateScreen — shows challenge stats, earned badges, existing recaps,
 * and "Generate recap" (DAY / WEEK / FIFTY). After generation, shows the URL
 * and a Share button that calls shareUrl() (the thin native share wrapper).
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { apiClient } from "../lib/apiClient";
import type { ChallengeDetail, RecapListItem, RecapKind } from "../lib/apiClient";
import { shareUrl } from "../lib/share";
import { colors } from "../theme";
import { elevation, ripple } from "../components/platform";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CelebrateScreenProps {
  challengeId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CelebrateScreen({ challengeId }: CelebrateScreenProps): React.JSX.Element {
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [recaps, setRecaps] = useState<RecapListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recap generation state
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [detail, recapList] = await Promise.all([
          apiClient.getChallenge(challengeId),
          apiClient.listRecaps(challengeId),
        ]);
        /* istanbul ignore else — cancellation guard */
        if (!cancelled) {
          setChallenge(detail);
          setRecaps(recapList);
          setLoading(false);
        }
      } catch (e) {
        /* istanbul ignore else — cancellation guard */
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load challenge");
          setLoading(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [challengeId]);

  const handleGenerate = useCallback(async (kind: RecapKind): Promise<void> => {
    setGenerating(true);
    setGenerateError(null);
    setGeneratedUrl(null);
    try {
      const result = await apiClient.generateRecap(challengeId, kind);
      setGeneratedUrl(result.url);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Failed to generate recap");
    } finally {
      setGenerating(false);
    }
  }, [challengeId]);

  const handleShare = useCallback(async (): Promise<void> => {
    /* istanbul ignore next — share button is only rendered when generatedUrl is non-null; this guard is a safety net unreachable through the rendered UI */
    if (!generatedUrl) return;
    await shareUrl(generatedUrl);
  }, [generatedUrl]);

  if (loading) {
    return (
      <View style={styles.center} testID="celebrate-loading">
        <ActivityIndicator color={colors.volt} size="large" />
      </View>
    );
  }

  if (error || !challenge) {
    return (
      <View style={styles.center} testID="celebrate-error">
        <Text style={styles.errorText} accessibilityRole="alert">
          {error ?? "Challenge not found"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="celebrate-content">
      {/* Title */}
      <Text style={styles.title} testID="celebrate-title" accessibilityRole="header">
        {challenge.title}
      </Text>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View
          style={styles.statBox}
          accessible
          accessibilityLabel={`Streak: ${challenge.currentStreak}`}
        >
          <Text style={styles.statValue} testID="celebrate-streak">{challenge.currentStreak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View
          style={styles.statBox}
          accessible
          accessibilityLabel={`Best streak: ${challenge.longestStreak}`}
        >
          <Text style={styles.statValue} testID="celebrate-longest">{challenge.longestStreak}</Text>
          <Text style={styles.statLabel}>Best</Text>
        </View>
        <View
          style={styles.statBox}
          accessible
          accessibilityLabel={`Badges: ${challenge.badges}`}
        >
          <Text style={styles.statValue} testID="celebrate-badges">{challenge.badges}</Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
        <View
          style={styles.statBox}
          accessible
          accessibilityLabel={`Cheers: ${challenge.cheering}`}
        >
          <Text style={styles.statValue} testID="celebrate-cheering">{challenge.cheering}</Text>
          <Text style={styles.statLabel}>Cheers</Text>
        </View>
      </View>

      {/* Milestones / earned badges */}
      {challenge.milestones.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Earned Badges
          </Text>
          {challenge.milestones.map((m) => (
            <View key={m.id} style={styles.milestoneRow}>
              <Text style={styles.milestoneKind}>{m.kind}</Text>
              <Text style={styles.milestoneDate}>{m.earnedAt.slice(0, 10)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Existing recaps */}
      {recaps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Past Recaps
          </Text>
          {recaps.map((r) => (
            <View key={r.id} style={styles.recapRow} testID={`recap-item-${r.id}`}>
              <Text style={styles.recapKind}>{r.kind}</Text>
              <Text style={styles.recapUrl} numberOfLines={1}>{r.url}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Generate recap */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Generate Recap
        </Text>

        {generating ? (
          <ActivityIndicator
            color={colors.volt}
            size="small"
            testID="generating-indicator"
            accessibilityLabel="Generating recap"
          />
        ) : (
          <View style={styles.generateButtons}>
            {(["DAY", "WEEK", "FIFTY"] as RecapKind[]).map((kind) => {
              const label =
                kind === "DAY"
                  ? "Generate Day Recap"
                  : kind === "WEEK"
                    ? "Generate Week Recap"
                    : "Generate 50-Day Recap";
              return (
                <Pressable
                  key={kind}
                  style={styles.generateButton}
                  onPress={() => { void handleGenerate(kind); }}
                  testID={`generate-${kind}`}
                  android_ripple={ripple()}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <Text style={styles.generateButtonText}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {generateError ? (
          <Text
            style={styles.generateErrorText}
            testID="generate-error"
            accessibilityRole="alert"
          >
            {generateError}
          </Text>
        ) : null}

        {generatedUrl ? (
          <View style={styles.resultBox}>
            <Text style={styles.recapUrlResult} testID="recap-url">{generatedUrl}</Text>
            <Pressable
              style={styles.shareButton}
              onPress={() => { void handleShare(); }}
              testID="share-button"
              android_ripple={ripple("rgba(18, 16, 19, 0.2)")}
              accessibilityRole="button"
              accessibilityLabel="Share recap"
              accessibilityHint="Opens the system share sheet"
            >
              <Text style={styles.shareButtonText}>Share</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
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
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    marginTop: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  milestoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  milestoneKind: {
    color: colors.volt,
    fontSize: 14,
    fontWeight: "600",
  },
  milestoneDate: {
    color: colors.text,
    fontSize: 12,
    opacity: 0.7,
  },
  recapRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  recapKind: {
    color: colors.volt,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  recapUrl: {
    color: colors.text,
    fontSize: 12,
    opacity: 0.7,
  },
  generateButtons: {
    gap: 10,
  },
  generateButton: {
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.volt,
    marginBottom: 8,
  },
  generateButtonText: {
    color: colors.volt,
    fontSize: 15,
    fontWeight: "600",
  },
  generateErrorText: {
    color: "#ff6b6b",
    fontSize: 14,
    marginTop: 8,
  },
  resultBox: {
    marginTop: 14,
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  recapUrlResult: {
    color: colors.text,
    fontSize: 13,
  },
  shareButton: {
    backgroundColor: colors.volt,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    overflow: "hidden",
    ...elevation(2),
  },
  shareButtonText: {
    color: colors.charcoal,
    fontSize: 15,
    fontWeight: "bold",
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 16,
    textAlign: "center",
  },
});
