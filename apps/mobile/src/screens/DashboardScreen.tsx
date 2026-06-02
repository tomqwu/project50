/**
 * DashboardScreen — renders the dashboard view-model using Momentum palette.
 * Loads challenges via apiClient (mocked in tests).
 */

import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { apiClient } from "../lib/apiClient";
import type { ChallengeDetail } from "../lib/apiClient";
import { buildDashboard } from "../viewmodels/dashboard";
import type { DashboardViewModel } from "../viewmodels/dashboard";
import { colors } from "../theme";
import { localDayKey } from "@project50/core";

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardScreen(): React.JSX.Element {
  const [vm, setVm] = useState<DashboardViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const challenges = await apiClient.listChallenges();

        if (challenges.length === 0) {
          /* istanbul ignore else — cancellation guard when component unmounts mid-flight */
          if (!cancelled) {
            setLoading(false);
            setVm(null);
          }
          return;
        }

        const primary = challenges[0]!;
        const detail: ChallengeDetail = await apiClient.getChallenge(primary.id);
        const todayDayKey = localDayKey(new Date(), "UTC");

        // Filter today's activities from the detail
        const todayActivities = detail.activities
          .filter((a) => a.dayKey === todayDayKey)
          .map((a) => ({ amount: a.amount ?? undefined, done: a.done }));

        const dashboard = buildDashboard(
          challenges.map((c) => ({
            id: c.id,
            title: c.title,
            goalType: c.goalType,
            dailyTarget: c.dailyTarget,
            unit: c.unit,
            startDate: c.startDate,
            lengthDays: c.lengthDays,
            dayStatuses: detail.id === c.id ? detail.dayStatuses : undefined,
          })),
          {
            id: detail.id,
            title: detail.title,
            goalType: detail.goalType,
            dailyTarget: detail.dailyTarget,
            unit: detail.unit,
            startDate: detail.startDate,
            lengthDays: detail.lengthDays,
            dayStatuses: detail.dayStatuses,
            todayActivities,
            badges: detail.badges,
            cheering: detail.cheering,
          },
          todayDayKey,
        );

        /* istanbul ignore else — cancellation guard when component unmounts mid-flight */
        if (!cancelled) {
          setVm(dashboard);
          setLoading(false);
        }
      } catch (e) {
        /* istanbul ignore else — cancellation guard when component unmounts mid-flight */
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
          setLoading(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <View style={styles.center} testID="dashboard-loading">
        <ActivityIndicator color={colors.volt} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center} testID="dashboard-error">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!vm) {
    return (
      <View style={styles.center} testID="dashboard-empty">
        <Text style={styles.emptyText}>No challenges yet. Start your first challenge!</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="dashboard-content">
      {/* Challenge title */}
      <Text style={styles.title} testID="challenge-title">{vm.title}</Text>

      {/* Day number */}
      <Text style={styles.dayNumber} testID="day-number">
        {`Day ${vm.dayNumber}/${vm.lengthDays}`}
      </Text>

      {/* Streak */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue} testID="current-streak">{vm.currentStreak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue} testID="longest-streak">{vm.longestStreak}</Text>
          <Text style={styles.statLabel}>Best</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue} testID="badges">{vm.badges}</Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue} testID="cheering">{vm.cheering}</Text>
          <Text style={styles.statLabel}>Cheers</Text>
        </View>
      </View>

      {/* Today's progress */}
      <View style={styles.progressSection}>
        <Text style={styles.sectionTitle}>Today</Text>
        {vm.todayProgress.goalType === "TARGET" ? (
          <Text style={styles.progressText} testID="today-progress">
            {`${vm.todayProgress.totalAmount} / ${vm.todayProgress.dailyTarget ?? 0} ${vm.todayProgress.unit ?? ""}`}
          </Text>
        ) : (
          <Text style={styles.progressText} testID="today-progress">
            {vm.todayProgress.completed ? "Done!" : "Not done yet"}
          </Text>
        )}
        {vm.todayProgress.completed && (
          <Text style={styles.completedBadge} testID="today-completed">Completed!</Text>
        )}
      </View>

      {/* Other challenges */}
      {vm.otherChallenges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Other Challenges</Text>
          {vm.otherChallenges.map((c) => (
            <View key={c.id} style={styles.otherChallenge}>
              <Text style={styles.otherTitle}>{c.title}</Text>
              <Text style={styles.otherStreak}>{`Streak: ${c.currentStreak}`}</Text>
            </View>
          ))}
        </View>
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
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
    marginTop: 16,
  },
  dayNumber: {
    color: colors.volt,
    fontSize: 16,
    marginBottom: 24,
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
  progressSection: {
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  progressText: {
    color: colors.text,
    fontSize: 20,
  },
  completedBadge: {
    color: colors.volt,
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 4,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 16,
    textAlign: "center",
  },
  emptyText: {
    color: colors.text,
    fontSize: 16,
    textAlign: "center",
  },
  otherChallenge: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  otherTitle: {
    color: colors.text,
    fontSize: 14,
  },
  otherStreak: {
    color: colors.volt,
    fontSize: 14,
  },
});
