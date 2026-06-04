/**
 * Project50Screen — the fixed 7-rule / 50-day program.
 *
 * Renders one of four states from useProject50:
 *  - NONE      → start choice (begin the program)
 *  - ACTIVE    → Day n/50 header, 7 tappable rule rows, n/7 progress
 *  - FAILED    → streak-broken notice + restart
 *  - COMPLETED → celebration
 *
 * Cross-platform: a single Expo/RN screen serves iOS and Android.
 */

import React from "react";
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { colors } from "../theme";
import { useProject50 } from "../viewmodels/project50";
import type { Project50RuleRow } from "../viewmodels/project50";

/** Device timezone, falling back to UTC when unavailable. */
function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function Project50Screen(): React.JSX.Element {
  const { loading, error, display, offline, start, toggle } = useProject50();

  if (loading) {
    return (
      <View style={styles.center} testID="p50-loading">
        <ActivityIndicator color={colors.volt} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center} testID="p50-error">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // display is non-null once not loading and not errored.
  /* istanbul ignore next — defensive: loading/error guards above cover null */
  if (!display) {
    return <View style={styles.center} testID="p50-empty" />;
  }

  if (display.status === "ACTIVE") {
    return (
      <ScrollView style={styles.container} testID="p50-active">
        {offline && <OfflineBanner />}
        <Text style={styles.title}>Project 50</Text>
        <Text style={styles.dayLabel} testID="p50-day">{display.dayLabel}</Text>
        <Text style={styles.progress} testID="p50-progress">
          {`${display.progressLabel} rules today`}
        </Text>
        <View style={styles.rules}>
          {display.rules!.map((rule) => (
            <RuleRow key={rule.id} rule={rule} onToggle={toggle} />
          ))}
        </View>
      </ScrollView>
    );
  }

  if (display.status === "FAILED") {
    return (
      <View style={styles.center} testID="p50-failed">
        <Text style={styles.failedHeading}>Streak broken</Text>
        {display.failedDayLabel !== undefined && (
          <Text style={styles.failedDetail} testID="p50-failed-day">
            {`You missed ${display.failedDayLabel}`}
            {display.failedRuleTitle !== undefined
              ? `: ${display.failedRuleTitle}`
              : ""}
          </Text>
        )}
        <Text style={styles.failedNote}>
          Project 50 is all-or-nothing. Start over to try again.
        </Text>
        <Pressable
          style={styles.cta}
          testID="p50-restart"
          onPress={() => void start(deviceTimezone())}
        >
          <Text style={styles.ctaText}>Restart Project 50</Text>
        </Pressable>
      </View>
    );
  }

  if (display.status === "COMPLETED") {
    return (
      <View style={styles.center} testID="p50-completed">
        <Text style={styles.celebrateEmoji}>🏆</Text>
        <Text style={styles.title}>Project 50 complete!</Text>
        <Text style={styles.celebrateDetail} testID="p50-completed-days">
          {`You finished all ${display.completedDays} days. Incredible discipline.`}
        </Text>
      </View>
    );
  }

  // NONE
  return (
    <View style={styles.center} testID="p50-none">
      <Text style={styles.title}>Project 50</Text>
      <Text style={styles.intro}>
        7 daily rules. 50 days straight. Miss a day and the streak resets to
        zero. Ready?
      </Text>
      <Pressable
        style={styles.cta}
        testID="p50-start"
        onPress={() => void start(deviceTimezone())}
      >
        <Text style={styles.ctaText}>Start Project 50</Text>
      </Pressable>
    </View>
  );
}

/** A subtle banner shown when the screen is rendering cached / queued data. */
function OfflineBanner(): React.JSX.Element {
  return (
    <View style={styles.offlineBanner} testID="p50-offline">
      <Text style={styles.offlineText}>
        Offline — changes will sync when you reconnect.
      </Text>
    </View>
  );
}

function RuleRow({
  rule,
  onToggle,
}: {
  rule: Project50RuleRow;
  onToggle: (ruleId: number, done: boolean) => void | Promise<void>;
}): React.JSX.Element {
  return (
    <Pressable
      style={styles.ruleRow}
      testID={`p50-rule-${rule.id}`}
      onPress={() => void onToggle(rule.id, !rule.done)}
    >
      <View style={[styles.checkbox, rule.done && styles.checkboxDone]}>
        {rule.done && <Text style={styles.checkmark} testID={`p50-rule-${rule.id}-check`}>✓</Text>}
      </View>
      <View style={styles.ruleText}>
        <Text style={styles.ruleTitle}>{rule.title}</Text>
        <Text style={styles.ruleDetail}>{rule.detail}</Text>
      </View>
    </Pressable>
  );
}

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
    padding: 24,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  dayLabel: {
    color: colors.volt,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  progress: {
    color: colors.text,
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 20,
  },
  rules: {
    marginBottom: 24,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.volt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkboxDone: {
    backgroundColor: colors.volt,
  },
  checkmark: {
    color: colors.charcoal,
    fontSize: 18,
    fontWeight: "bold",
  },
  ruleText: {
    flex: 1,
  },
  ruleTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  ruleDetail: {
    color: colors.text,
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  intro: {
    color: colors.text,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  cta: {
    backgroundColor: colors.volt,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  ctaText: {
    color: colors.charcoal,
    fontSize: 16,
    fontWeight: "bold",
  },
  failedHeading: {
    color: "#ff6b6b",
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 12,
  },
  failedDetail: {
    color: colors.text,
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  failedNote: {
    color: colors.text,
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 24,
  },
  celebrateEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  celebrateDetail: {
    color: colors.text,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 16,
    textAlign: "center",
  },
  offlineBanner: {
    backgroundColor: "#3a2f00",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  offlineText: {
    color: colors.volt,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
