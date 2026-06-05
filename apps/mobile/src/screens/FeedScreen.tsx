/**
 * FeedScreen — displays the followees' activity feed with cheer (optimistic update).
 * Loads via apiClient.getFeed(); renders cards with challenge title, day, note,
 * photo (when present), and a cheer button with optimistic increment + revert on error.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { apiClient } from "../lib/apiClient";
import type { FeedActivity } from "../lib/apiClient";
import { colors } from "../theme";
import { elevation, ripple } from "../components/platform";

// ─── Component ────────────────────────────────────────────────────────────────

export function FeedScreen(): React.JSX.Element {
  const [items, setItems] = useState<FeedActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const { items: feedItems } = await apiClient.getFeed();
        /* istanbul ignore else — cancellation guard */
        if (!cancelled) {
          setItems(feedItems);
          setLoading(false);
        }
      } catch (e) {
        /* istanbul ignore else — cancellation guard */
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load feed");
          setLoading(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const handleCheer = useCallback((activityId: string) => {
    // Optimistic increment
    setItems((prev) =>
      prev.map((item) =>
        item.id === activityId
          ? { ...item, cheerCount: item.cheerCount + 1 }
          : item,
      ),
    );

    // Fire API call; revert on failure
    apiClient.react(activityId, "CHEER").catch(() => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === activityId
            ? { ...item, cheerCount: item.cheerCount - 1 }
            : item,
        ),
      );
    });
  }, []);

  if (loading) {
    return (
      <View style={styles.center} testID="feed-loading">
        <ActivityIndicator color={colors.volt} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center} testID="feed-error">
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center} testID="feed-empty">
        <Text style={styles.emptyText}>No activity yet. Follow some friends!</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="feed-list">
      {items.map((item) => (
        <FeedCard key={item.id} item={item} onCheer={handleCheer} />
      ))}
    </ScrollView>
  );
}

// ─── FeedCard ─────────────────────────────────────────────────────────────────

interface FeedCardProps {
  item: FeedActivity;
  onCheer: (activityId: string) => void;
}

function FeedCard({ item, onCheer }: FeedCardProps): React.JSX.Element {
  const photoUrl = item.media[0]?.url ?? null;

  return (
    <View style={styles.card} testID={`feed-item-${item.id}`}>
      {/* Handle + Project 50 badge */}
      <View style={styles.headerRow}>
        <Text style={styles.handle} testID={`feed-handle-${item.id}`}>
          @{item.user.handle}
        </Text>
        {item.isProject50 ? (
          <Text style={styles.badge} testID={`project50-badge-${item.id}`}>
            {item.project50Day != null
              ? `Project 50 · Day ${item.project50Day}`
              : "Project 50"}
          </Text>
        ) : null}
      </View>

      {/* Challenge title + day */}
      <Text style={styles.challengeTitle} accessibilityRole="header">
        {item.challenge.title}
      </Text>
      <Text style={styles.dayKey}>{item.dayKey}</Text>

      {/* Note */}
      {item.note ? (
        <Text style={styles.note}>{item.note}</Text>
      ) : null}

      {/* Photo */}
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.photo}
          testID={`feed-photo-${item.id}`}
          resizeMode="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Photo from @${item.user.handle}'s ${item.challenge.title} activity`}
        />
      ) : null}

      {/* Cheer row */}
      <View style={styles.cheerRow}>
        <Pressable
          style={styles.cheerButton}
          onPress={() => onCheer(item.id)}
          testID={`cheer-button-${item.id}`}
          android_ripple={ripple("rgba(18, 16, 19, 0.2)")}
          accessibilityRole="button"
          accessibilityLabel={`Cheer @${item.user.handle}`}
          accessibilityHint="Adds a cheer to this activity"
        >
          <Text style={styles.cheerButtonText}>Cheer</Text>
        </Pressable>
        <Text
          style={styles.cheerCount}
          testID={`cheer-count-${item.id}`}
          accessibilityLabel={`${item.cheerCount} cheers`}
        >
          {item.cheerCount}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.charcoal,
    padding: 12,
  },
  center: {
    flex: 1,
    backgroundColor: colors.charcoal,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#1e1e1e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
    ...elevation(1),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  handle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.9,
  },
  badge: {
    color: colors.charcoal,
    backgroundColor: colors.volt,
    fontSize: 11,
    fontWeight: "bold",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  challengeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  dayKey: {
    color: colors.volt,
    fontSize: 12,
    marginBottom: 8,
    opacity: 0.8,
  },
  note: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 8,
    opacity: 0.9,
  },
  photo: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    marginBottom: 10,
  },
  cheerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cheerButton: {
    backgroundColor: colors.volt,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: "center",
    overflow: "hidden",
  },
  cheerButtonText: {
    color: colors.charcoal,
    fontSize: 13,
    fontWeight: "bold",
  },
  cheerCount: {
    color: colors.text,
    fontSize: 14,
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
});
