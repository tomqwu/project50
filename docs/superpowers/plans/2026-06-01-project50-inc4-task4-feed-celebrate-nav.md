# Feed + Celebrate + Share + Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `FeedScreen`, `CelebrateScreen`, `src/lib/share.ts`, React Navigation stack wiring, final green on all checks (jest/tsc/lint/web build), and README + COVERAGE.md updates — completing the A–E program.

**Architecture:** Three new source files (`FeedScreen.tsx`, `CelebrateScreen.tsx`, `share.ts`) follow exactly the same pattern as `DashboardScreen.tsx` and `LogActivityScreen.tsx`: apiClient mocked in RNTL tests, native-only call sites excluded with `/* istanbul ignore next */` + documented in `COVERAGE.md`. Navigation uses `@react-navigation/native` + `@react-navigation/stack` (Stack navigator) — the navigator container file is documented as native glue and excluded from thresholds. Screens remain directly importable + renderable via RNTL (no navigator needed in tests).

**Tech Stack:** Expo SDK 52, React Native 0.76, TypeScript 5, `jest-expo` + `@testing-library/react-native`, `@react-navigation/native@6`, `@react-navigation/stack@6`, `expo-sharing`, `react-native-screens`, `react-native-safe-area-context`. `@project50/core` reused (no rule duplication).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/share.ts` | Create | `shareUrl(url)` wrapper around `expo-sharing` / `Linking.openURL`; native call excluded |
| `src/lib/share.test.ts` | Create | 99% tests for share.ts (mock Sharing + Linking) |
| `src/screens/FeedScreen.tsx` | Create | Renders feed items, cheer button with optimistic update |
| `src/screens/FeedScreen.test.tsx` | Create | RNTL tests: renders items, empty, cheer optimistic+revert, loading, error |
| `src/screens/CelebrateScreen.tsx` | Create | Stats + badges + generate recap + share |
| `src/screens/CelebrateScreen.test.tsx` | Create | RNTL tests: loads data, generate kind, shows url, share handler, loading, error |
| `src/navigation/AppNavigator.tsx` | Create | Stack navigator wiring — documented native-glue exclusion |
| `App.tsx` (root) | Create | `registerRootComponent(AppNavigator)` — documented native-glue exclusion |
| `apps/mobile/COVERAGE.md` | Modify | Add Task 4 exclusions: `share.ts` native call, nav container, App.tsx |
| `README.md` (root) | Modify | Add "Native app (Expo)" section; mark A–E program COMPLETE |
| `package.json` (mobile) | Modify | Add `expo-sharing`, `@react-navigation/native`, `@react-navigation/stack`, `react-native-screens`, `react-native-safe-area-context` |
| `jest.config.js` (mobile) | Modify | Add `expo-sharing`, `react-native-screens`, `react-native-safe-area-context` to `transformIgnorePatterns` |

---

### Task 1: Add `expo-sharing` and `@react-navigation` dependencies

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/jest.config.js`

- [ ] **Step 1: Add deps to `apps/mobile/package.json`**

Open `/Users/tomwu/Projects/project50/apps/mobile/package.json` and add to `"dependencies"`:

```json
"expo-sharing": "~12.0.1",
"@react-navigation/native": "^6.1.18",
"@react-navigation/stack": "^6.4.1",
"react-native-screens": "~3.35.0",
"react-native-safe-area-context": "4.12.0"
```

The full `dependencies` block should be:

```json
"dependencies": {
  "expo": "52.0.49",
  "expo-auth-session": "~5.5.2",
  "expo-crypto": "~13.0.2",
  "expo-image-picker": "~15.0.7",
  "expo-secure-store": "~13.0.2",
  "expo-sharing": "~12.0.1",
  "expo-web-browser": "~13.0.3",
  "react": "18.3.1",
  "react-native": "0.76.9",
  "@project50/core": "workspace:*",
  "@react-navigation/native": "^6.1.18",
  "@react-navigation/stack": "^6.4.1",
  "react-native-screens": "~3.35.0",
  "react-native-safe-area-context": "4.12.0"
}
```

- [ ] **Step 2: Update `transformIgnorePatterns` in `apps/mobile/jest.config.js`**

The `transformIgnorePatterns` regex must let `expo-sharing`, `react-native-screens`, `react-native-safe-area-context`, and `@react-navigation/*` be transpiled by Jest. Change the existing pattern's exclusion list to include these:

```js
transformIgnorePatterns: [
  "/node_modules/(?!\\.pnpm|((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-screens|react-native-safe-area-context|expo-sharing)",
  "/node_modules/react-native-reanimated/plugin/",
],
```

Note: `react-navigation` and `@react-navigation/.*` are already present in the existing pattern — just add `react-native-screens`, `react-native-safe-area-context`, and `expo-sharing`.

- [ ] **Step 3: Install dependencies**

```bash
cd /Users/tomwu/Projects/project50 && pnpm install
```

Expected: resolves cleanly. If version conflicts appear, adjust the pinned versions to match what Expo SDK 52 recommends (check `expo install expo-sharing` output).

- [ ] **Step 4: Verify lockfile is updated**

```bash
cd /Users/tomwu/Projects/project50 && head -5 pnpm-lock.yaml
```

Expected: file is modified (no frozen-lockfile error yet — that comes in the final check).

---

### Task 2: `src/lib/share.ts` + tests

**Files:**
- Create: `apps/mobile/src/lib/share.ts`
- Create: `apps/mobile/src/lib/share.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `/Users/tomwu/Projects/project50/apps/mobile/src/lib/share.test.ts`:

```ts
/**
 * Tests for share.ts.
 * Mocks expo-sharing and Linking. The native shareAsync/openURL call is excluded
 * (istanbul ignore next) — the surrounding logic (checking sharing capability) is tested.
 * See COVERAGE.md.
 */

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  return {
    ...RN,
    Linking: {
      openURL: jest.fn(),
    },
  };
});

import * as Sharing from "expo-sharing";
import { Linking } from "react-native";
import { shareUrl } from "./share";

const mockIsAvailable = Sharing.isAvailableAsync as jest.Mock;
const mockShareAsync = Sharing.shareAsync as jest.Mock;
const mockOpenURL = Linking.openURL as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("shareUrl", () => {
  it("calls Sharing.shareAsync when sharing is available", async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockShareAsync.mockResolvedValueOnce(undefined);

    await shareUrl("https://example.com/share");

    expect(mockIsAvailable).toHaveBeenCalledTimes(1);
    expect(mockShareAsync).toHaveBeenCalledWith("https://example.com/share");
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it("falls back to Linking.openURL when sharing is not available", async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    mockOpenURL.mockResolvedValueOnce(undefined);

    await shareUrl("https://example.com/share");

    expect(mockIsAvailable).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).toHaveBeenCalledWith("https://example.com/share");
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it("propagates errors from Sharing.shareAsync", async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockShareAsync.mockRejectedValueOnce(new Error("Share failed"));

    await expect(shareUrl("https://example.com/share")).rejects.toThrow("Share failed");
  });

  it("propagates errors from Linking.openURL", async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    mockOpenURL.mockRejectedValueOnce(new Error("Open failed"));

    await expect(shareUrl("https://example.com/share")).rejects.toThrow("Open failed");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails (module not found)**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile test -- --testPathPattern="share.test" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './share'`

- [ ] **Step 3: Create `src/lib/share.ts`**

Create `/Users/tomwu/Projects/project50/apps/mobile/src/lib/share.ts`:

```ts
/**
 * share.ts — thin wrapper around expo-sharing / Linking.openURL.
 *
 * The native call sites (shareAsync / openURL) are excluded from coverage — they
 * are single-expression native bridge calls with no branching logic of our own.
 * The surrounding logic (checking isAvailableAsync) is fully tested.
 * See COVERAGE.md → Task 4 exclusions.
 */

import * as Sharing from "expo-sharing";
import { Linking } from "react-native";

/**
 * Share a URL using expo-sharing when available, falling back to Linking.openURL.
 * The actual native call is the documented thin exclusion; the capability-check
 * branch is tested.
 */
export async function shareUrl(url: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (available) {
    /* istanbul ignore next — native shareAsync call; zero own logic */
    await Sharing.shareAsync(url);
  } else {
    /* istanbul ignore next — native openURL call; zero own logic */
    await Linking.openURL(url);
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile test -- --testPathPattern="share.test" --no-coverage 2>&1 | tail -20
```

Expected: PASS — 4 tests green.

---

### Task 3: `FeedScreen.tsx` + `FeedScreen.test.tsx`

**Files:**
- Create: `apps/mobile/src/screens/FeedScreen.tsx`
- Create: `apps/mobile/src/screens/FeedScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `/Users/tomwu/Projects/project50/apps/mobile/src/screens/FeedScreen.test.tsx`:

```tsx
/**
 * RNTL tests for FeedScreen.
 * apiClient is mocked. Tests: loading state, empty state, renders feed items,
 * cheer button optimistic increment, revert on API failure, error state.
 */

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react-native";

jest.mock("../lib/apiClient", () => ({
  apiClient: {
    getFeed: jest.fn(),
    react: jest.fn(),
  },
}));

import { apiClient } from "../lib/apiClient";
import { FeedScreen } from "./FeedScreen";

const mockGetFeed = apiClient.getFeed as jest.Mock;
const mockReact = apiClient.react as jest.Mock;

// ─── Test data ──────────────────────────────────────────────────────────────

const makeFeedItem = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  challengeId: "c1",
  userId: "u1",
  dayKey: "2026-01-15",
  activityType: null,
  amount: null,
  done: true,
  note: "Felt great!",
  mood: 5,
  createdAt: "2026-01-15T09:00:00.000Z",
  media: [],
  challenge: {
    id: "c1",
    title: "Run 5K Daily",
    goalType: "BINARY",
    dailyTarget: null,
    unit: null,
    startDate: "2026-01-01",
    lengthDays: 50,
    timezone: "UTC",
    visibility: "PUBLIC",
    currentStreak: 5,
    longestStreak: 10,
    badges: 2,
    cheering: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
  },
  cheerCount: 3,
  hasPhoto: false,
  userHandle: "alice",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("FeedScreen", () => {
  it("shows loading indicator initially", () => {
    mockGetFeed.mockReturnValueOnce(new Promise(() => undefined));
    render(<FeedScreen />);
    expect(screen.getByTestId("feed-loading")).toBeTruthy();
  });

  it("shows empty state when feed is empty", async () => {
    mockGetFeed.mockResolvedValueOnce([]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-empty")).toBeTruthy();
    });
    expect(screen.getByText(/No activity yet/i)).toBeTruthy();
  });

  it("renders feed items after loading", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1"), makeFeedItem("a2")]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-list")).toBeTruthy();
    });
    expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    expect(screen.getByTestId("feed-item-a2")).toBeTruthy();
  });

  it("renders challenge title in each feed card", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1")]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    });
    expect(screen.getByText("Run 5K Daily")).toBeTruthy();
  });

  it("renders day key in feed card", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1")]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    });
    expect(screen.getByText(/2026-01-15/)).toBeTruthy();
  });

  it("renders note text in feed card", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1")]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    });
    expect(screen.getByText("Felt great!")).toBeTruthy();
  });

  it("renders cheer count for an item", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1", { cheerCount: 7 })]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("cheer-count-a1")).toBeTruthy();
    });
    expect(screen.getByTestId("cheer-count-a1").props.children).toBe(7);
  });

  it("optimistically increments cheer count on cheer button press", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1", { cheerCount: 3 })]);
    mockReact.mockResolvedValueOnce({ id: "r1", activityId: "a1", userId: "u1", kind: "CHEER", text: null, createdAt: "" });

    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("cheer-button-a1")).toBeTruthy();
    });

    // Before cheer: count is 3
    expect(screen.getByTestId("cheer-count-a1").props.children).toBe(3);

    fireEvent.press(screen.getByTestId("cheer-button-a1"));

    // Optimistic: immediately shows 4
    expect(screen.getByTestId("cheer-count-a1").props.children).toBe(4);

    // After API resolves: still 4
    await waitFor(() => {
      expect(mockReact).toHaveBeenCalledWith("a1", "CHEER");
    });
    expect(screen.getByTestId("cheer-count-a1").props.children).toBe(4);
  });

  it("reverts cheer count on API failure", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1", { cheerCount: 3 })]);
    mockReact.mockRejectedValueOnce(new Error("Network error"));

    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("cheer-button-a1")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("cheer-button-a1"));
      // Wait for the rejection to be handled
    });

    await waitFor(() => {
      expect(screen.getByTestId("cheer-count-a1").props.children).toBe(3);
    });
  });

  it("shows error state when getFeed throws", async () => {
    mockGetFeed.mockRejectedValueOnce(new Error("Feed unavailable"));
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-error")).toBeTruthy();
    });
    expect(screen.getByText("Feed unavailable")).toBeTruthy();
  });

  it("shows generic error for non-Error throw", async () => {
    mockGetFeed.mockRejectedValueOnce("oops");
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-error")).toBeTruthy();
    });
    expect(screen.getByText("Failed to load feed")).toBeTruthy();
  });

  it("renders photo image when item has media", async () => {
    const itemWithPhoto = makeFeedItem("a1", {
      hasPhoto: true,
      media: [{ objectKey: "key/photo.jpg", url: "https://cdn.example.com/photo.jpg", width: 800, height: 600, order: 0 }],
    });
    mockGetFeed.mockResolvedValueOnce([itemWithPhoto]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-photo-a1")).toBeTruthy();
    });
    expect(screen.getByTestId("feed-photo-a1").props.source.uri).toBe("https://cdn.example.com/photo.jpg");
  });

  it("does not render photo when item has no media", async () => {
    mockGetFeed.mockResolvedValueOnce([makeFeedItem("a1", { media: [] })]);
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item-a1")).toBeTruthy();
    });
    expect(screen.queryByTestId("feed-photo-a1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile test -- --testPathPattern="FeedScreen.test" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './FeedScreen'`

- [ ] **Step 3: Create `FeedScreen.tsx`**

Create `/Users/tomwu/Projects/project50/apps/mobile/src/screens/FeedScreen.tsx`:

```tsx
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
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { apiClient } from "../lib/apiClient";
import type { FeedActivity } from "../lib/apiClient";
import { colors } from "../theme";

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
        const feed = await apiClient.getFeed();
        /* istanbul ignore else — cancellation guard */
        if (!cancelled) {
          setItems(feed);
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
        <Text style={styles.errorText}>{error}</Text>
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
      {/* Challenge title + day */}
      <Text style={styles.challengeTitle}>{item.challenge.title}</Text>
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
        />
      ) : null}

      {/* Cheer row */}
      <View style={styles.cheerRow}>
        <TouchableOpacity
          style={styles.cheerButton}
          onPress={() => onCheer(item.id)}
          testID={`cheer-button-${item.id}`}
        >
          <Text style={styles.cheerButtonText}>Cheer</Text>
        </TouchableOpacity>
        <Text style={styles.cheerCount} testID={`cheer-count-${item.id}`}>
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
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile test -- --testPathPattern="FeedScreen.test" --no-coverage 2>&1 | tail -30
```

Expected: PASS — all tests green.

---

### Task 4: `CelebrateScreen.tsx` + `CelebrateScreen.test.tsx`

**Files:**
- Create: `apps/mobile/src/screens/CelebrateScreen.tsx`
- Create: `apps/mobile/src/screens/CelebrateScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `/Users/tomwu/Projects/project50/apps/mobile/src/screens/CelebrateScreen.test.tsx`:

```tsx
/**
 * RNTL tests for CelebrateScreen.
 * apiClient + share mocked. Tests:
 * - loading state
 * - renders challenge stats + badges
 * - generate recap buttons for each kind (DAY / WEEK / FIFTY)
 * - shows recap url after generation
 * - share handler calls shareUrl with the recap url
 * - error states (getChallenge / listRecaps / generateRecap)
 * - lists existing recaps
 */

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react-native";

jest.mock("../lib/apiClient", () => ({
  apiClient: {
    getChallenge: jest.fn(),
    listRecaps: jest.fn(),
    generateRecap: jest.fn(),
  },
}));

jest.mock("../lib/share", () => ({
  shareUrl: jest.fn(),
}));

import { apiClient } from "../lib/apiClient";
import { shareUrl } from "../lib/share";
import { CelebrateScreen } from "./CelebrateScreen";

const mockGetChallenge = apiClient.getChallenge as jest.Mock;
const mockListRecaps = apiClient.listRecaps as jest.Mock;
const mockGenerateRecap = apiClient.generateRecap as jest.Mock;
const mockShareUrl = shareUrl as jest.Mock;

// ─── Test data ──────────────────────────────────────────────────────────────

const mockChallengeDetail = {
  id: "c1",
  title: "Run 5K Daily",
  goalType: "TARGET",
  dailyTarget: 5,
  unit: "km",
  startDate: "2026-01-01",
  lengthDays: 50,
  timezone: "UTC",
  visibility: "PUBLIC",
  currentStreak: 10,
  longestStreak: 15,
  badges: 3,
  cheering: 8,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
  activities: [],
  dayStatuses: [],
  milestones: [
    { id: "m1", kind: "STREAK_7", earnedAt: "2026-01-08T00:00:00.000Z" },
    { id: "m2", kind: "STREAK_14", earnedAt: "2026-01-15T00:00:00.000Z" },
    { id: "m3", kind: "HALFWAY", earnedAt: "2026-01-25T00:00:00.000Z" },
  ],
};

const mockRecaps = [
  { id: "r1", kind: "DAY", url: "https://cdn.example.com/recap-day.mp4", createdAt: "2026-01-15T10:00:00.000Z" },
];

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("CelebrateScreen", () => {
  it("shows loading indicator initially", () => {
    mockGetChallenge.mockReturnValueOnce(new Promise(() => undefined));
    mockListRecaps.mockReturnValueOnce(new Promise(() => undefined));
    render(<CelebrateScreen challengeId="c1" />);
    expect(screen.getByTestId("celebrate-loading")).toBeTruthy();
  });

  it("renders challenge title after loading", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce(mockRecaps);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-title")).toBeTruthy();
    });
    expect(screen.getByText("Run 5K Daily")).toBeTruthy();
  });

  it("renders streak stats", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-streak")).toBeTruthy();
    });
    expect(screen.getByTestId("celebrate-streak").props.children).toBe(10);
  });

  it("renders badge count", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-badges")).toBeTruthy();
    });
    expect(screen.getByTestId("celebrate-badges").props.children).toBe(3);
  });

  it("renders milestone kinds", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-title")).toBeTruthy();
    });
    expect(screen.getByText("STREAK_7")).toBeTruthy();
    expect(screen.getByText("HALFWAY")).toBeTruthy();
  });

  it("lists existing recaps", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce(mockRecaps);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("recap-item-r1")).toBeTruthy();
    });
    expect(screen.getByText("https://cdn.example.com/recap-day.mp4")).toBeTruthy();
  });

  it("generates a DAY recap when 'Generate Day Recap' is pressed", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockResolvedValueOnce({
      recapId: "r2",
      kind: "DAY",
      url: "https://cdn.example.com/new-day.mp4",
    });

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-DAY"));
    });

    expect(mockGenerateRecap).toHaveBeenCalledWith("c1", "DAY");
    await waitFor(() => {
      expect(screen.getByTestId("recap-url")).toBeTruthy();
    });
    expect(screen.getByText("https://cdn.example.com/new-day.mp4")).toBeTruthy();
  });

  it("generates a WEEK recap when 'Generate Week Recap' is pressed", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockResolvedValueOnce({
      recapId: "r3",
      kind: "WEEK",
      url: "https://cdn.example.com/new-week.mp4",
    });

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-WEEK")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-WEEK"));
    });

    expect(mockGenerateRecap).toHaveBeenCalledWith("c1", "WEEK");
  });

  it("generates a FIFTY recap when 'Generate 50-Day Recap' is pressed", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockResolvedValueOnce({
      recapId: "r4",
      kind: "FIFTY",
      url: "https://cdn.example.com/new-fifty.mp4",
    });

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-FIFTY")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-FIFTY"));
    });

    expect(mockGenerateRecap).toHaveBeenCalledWith("c1", "FIFTY");
  });

  it("calls shareUrl with the generated recap url when share is pressed", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockResolvedValueOnce({
      recapId: "r2",
      kind: "DAY",
      url: "https://cdn.example.com/new-day.mp4",
    });
    mockShareUrl.mockResolvedValueOnce(undefined);

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-DAY"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("share-button")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("share-button"));
    });

    expect(mockShareUrl).toHaveBeenCalledWith("https://cdn.example.com/new-day.mp4");
  });

  it("shows error state when getChallenge throws", async () => {
    mockGetChallenge.mockRejectedValueOnce(new Error("Challenge not found"));
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-error")).toBeTruthy();
    });
    expect(screen.getByText("Challenge not found")).toBeTruthy();
  });

  it("shows generic error for non-Error throw", async () => {
    mockGetChallenge.mockRejectedValueOnce("something bad");
    mockListRecaps.mockResolvedValueOnce([]);
    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("celebrate-error")).toBeTruthy();
    });
    expect(screen.getByText("Failed to load challenge")).toBeTruthy();
  });

  it("shows generating indicator while generateRecap is in flight", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    let resolveGenerate!: (v: unknown) => void;
    mockGenerateRecap.mockReturnValueOnce(new Promise((r) => { resolveGenerate = r; }));

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("generate-DAY"));

    expect(screen.getByTestId("generating-indicator")).toBeTruthy();

    await act(async () => {
      resolveGenerate({ recapId: "r5", kind: "DAY", url: "https://cdn.example.com/done.mp4" });
    });
  });

  it("shows generate error when generateRecap fails", async () => {
    mockGetChallenge.mockResolvedValueOnce(mockChallengeDetail);
    mockListRecaps.mockResolvedValueOnce([]);
    mockGenerateRecap.mockRejectedValueOnce(new Error("Render failed"));

    render(<CelebrateScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("generate-DAY")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("generate-DAY"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("generate-error")).toBeTruthy();
    });
    expect(screen.getByText("Render failed")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile test -- --testPathPattern="CelebrateScreen.test" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './CelebrateScreen'`

- [ ] **Step 3: Create `CelebrateScreen.tsx`**

Create `/Users/tomwu/Projects/project50/apps/mobile/src/screens/CelebrateScreen.tsx`:

```tsx
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
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { apiClient } from "../lib/apiClient";
import type { ChallengeDetail, RecapListItem, RecapKind } from "../lib/apiClient";
import { shareUrl } from "../lib/share";
import { colors } from "../theme";

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
        <Text style={styles.errorText}>{error ?? "Challenge not found"}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="celebrate-content">
      {/* Title */}
      <Text style={styles.title} testID="celebrate-title">{challenge.title}</Text>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue} testID="celebrate-streak">{challenge.currentStreak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue} testID="celebrate-longest">{challenge.longestStreak}</Text>
          <Text style={styles.statLabel}>Best</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue} testID="celebrate-badges">{challenge.badges}</Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue} testID="celebrate-cheering">{challenge.cheering}</Text>
          <Text style={styles.statLabel}>Cheers</Text>
        </View>
      </View>

      {/* Milestones / earned badges */}
      {challenge.milestones.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Earned Badges</Text>
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
          <Text style={styles.sectionTitle}>Past Recaps</Text>
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
        <Text style={styles.sectionTitle}>Generate Recap</Text>

        {generating ? (
          <ActivityIndicator
            color={colors.volt}
            size="small"
            testID="generating-indicator"
          />
        ) : (
          <View style={styles.generateButtons}>
            {(["DAY", "WEEK", "FIFTY"] as RecapKind[]).map((kind) => (
              <TouchableOpacity
                key={kind}
                style={styles.generateButton}
                onPress={() => { void handleGenerate(kind); }}
                testID={`generate-${kind}`}
              >
                <Text style={styles.generateButtonText}>
                  {kind === "DAY" ? "Generate Day Recap" : kind === "WEEK" ? "Generate Week Recap" : "Generate 50-Day Recap"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {generateError ? (
          <Text style={styles.generateErrorText} testID="generate-error">
            {generateError}
          </Text>
        ) : null}

        {generatedUrl ? (
          <View style={styles.resultBox}>
            <Text style={styles.recapUrlResult} testID="recap-url">{generatedUrl}</Text>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => { void handleShare(); }}
              testID="share-button"
            >
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
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
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile test -- --testPathPattern="CelebrateScreen.test" --no-coverage 2>&1 | tail -30
```

Expected: PASS — all tests green.

---

### Task 5: Navigation wiring (`AppNavigator.tsx` + `App.tsx`)

**Files:**
- Create: `apps/mobile/src/navigation/AppNavigator.tsx`
- Create: `apps/mobile/App.tsx`

These files are **native-glue exclusions** (documented in COVERAGE.md / Task 6). They contain no branching logic — just stack navigator wiring and `registerRootComponent`. RNTL tests render screens directly, not through the navigator.

- [ ] **Step 1: Create `src/navigation/AppNavigator.tsx`**

Create `/Users/tomwu/Projects/project50/apps/mobile/src/navigation/AppNavigator.tsx`:

```tsx
/**
 * AppNavigator — React Navigation Stack wiring.
 *
 * COVERAGE EXCLUSION: Whole file.
 * This is pure declarative native bridge wiring with zero branching logic of our own.
 * NavigationContainer + createStackNavigator exercise the React Navigation native bridge.
 * Screens are tested individually via RNTL (rendered directly, no navigator needed).
 * See COVERAGE.md → Task 5 exclusions.
 */

/* istanbul ignore file */

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import { DashboardScreen } from "../screens/DashboardScreen";
import { LogActivityScreen } from "../screens/LogActivityScreen";
import { FeedScreen } from "../screens/FeedScreen";
import { CelebrateScreen } from "../screens/CelebrateScreen";
import { colors } from "../theme";

export type RootStackParamList = {
  Dashboard: undefined;
  LogActivity: { challengeId: string; goalType: "TARGET" | "BINARY"; dailyTarget?: number; unit?: string; dayKey: string };
  Feed: undefined;
  Celebrate: { challengeId: string };
};

const Stack = createStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.charcoal },
  headerTintColor: colors.volt,
  headerTitleStyle: { color: colors.text, fontWeight: "bold" as const },
  cardStyle: { backgroundColor: colors.charcoal },
};

export function AppNavigator(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Dashboard" screenOptions={screenOptions}>
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Dashboard" }} />
        <Stack.Screen
          name="LogActivity"
          options={{ title: "Log Activity" }}
        >
          {(props) => (
            <LogActivityScreen
              challengeId={props.route.params.challengeId}
              goalType={props.route.params.goalType}
              dailyTarget={props.route.params.dailyTarget}
              unit={props.route.params.unit}
              dayKey={props.route.params.dayKey}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Feed" component={FeedScreen} options={{ title: "Feed" }} />
        <Stack.Screen
          name="Celebrate"
          options={{ title: "Celebrate" }}
        >
          {(props) => <CelebrateScreen challengeId={props.route.params.challengeId} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 2: Create `App.tsx`**

Create `/Users/tomwu/Projects/project50/apps/mobile/App.tsx`:

```tsx
/**
 * App entry point.
 *
 * COVERAGE EXCLUSION: Whole file.
 * registerRootComponent is a single native bridge call with no logic.
 * The navigator is wired in AppNavigator.tsx (also excluded — native glue).
 * See COVERAGE.md → Task 5 exclusions.
 */

/* istanbul ignore file */

import { registerRootComponent } from "expo";
import { AppNavigator } from "./src/navigation/AppNavigator";

registerRootComponent(AppNavigator);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile typecheck 2>&1 | tail -20
```

Expected: 0 errors. If there are type errors in the navigator (e.g., around `createStackNavigator` generics), check that `@react-navigation/stack` types are installed. If `@types/react-navigation` is needed, add to devDeps.

---

### Task 6: Update `COVERAGE.md` with Task 4 + 5 exclusions

**Files:**
- Modify: `apps/mobile/COVERAGE.md`

- [ ] **Step 1: Append Task 4 and 5 sections to COVERAGE.md**

Open `/Users/tomwu/Projects/project50/apps/mobile/COVERAGE.md` and add to the "Task exclusion log" section and to the exclusions table:

In the **table** under "Explicitly excluded from thresholds", add these rows:

| `src/lib/share.ts` — `shareAsync` and `openURL` call sites | Line-level `/* istanbul ignore next */` | `expo-sharing`'s `.shareAsync()` and RN `Linking.openURL()` are single-expression native bridge calls. The surrounding logic (`isAvailableAsync` branch) is fully tested. |
| `src/navigation/AppNavigator.tsx` | Whole file (`/* istanbul ignore file */`) | Pure declarative React Navigation stack wiring — NavigationContainer + createStackNavigator exercise the native bridge; zero branching logic of our own. Screens are tested directly via RNTL. |
| `App.tsx` | Whole file (`/* istanbul ignore file */`) | `registerRootComponent` is a single native bridge call with no logic. |

In the **Task exclusion log**, add:

```markdown
### Task 4 (Feed + Celebrate + share)
- Added `src/lib/share.ts` line-level exclusions for `Sharing.shareAsync` and `Linking.openURL` native call sites.
- `src/screens/CelebrateScreen.tsx` share call site is already documented in the table above (the wrapper is `shareUrl`, which is tested — only the internal native calls in `share.ts` are excluded).

### Task 5 (Navigation + App entry)
- Added whole-file exclusion for `src/navigation/AppNavigator.tsx` (React Navigation native bridge wiring, zero own logic).
- Added whole-file exclusion for `App.tsx` (`registerRootComponent` native call, zero own logic).
```

---

### Task 7: Full green check — mobile tests + typecheck + lint

**Files:** No source changes — verification only.

- [ ] **Step 1: Run the full mobile test suite with coverage**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile test 2>&1 | tail -40
```

Expected:
- All tests pass.
- Coverage thresholds met on `src/lib/**`, `src/viewmodels/**`, `src/components/**`, `src/screens/**`.
- If any threshold is missed, find the uncovered line, add a targeted test, and rerun.

- [ ] **Step 2: Mobile typecheck**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile typecheck 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 3: Mobile lint**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/mobile lint 2>&1 | tail -20
```

Expected: 0 warnings (max-warnings=0).

---

### Task 8: Whole-repo green check

**Files:** No source changes — verification only.

- [ ] **Step 1: Whole-repo typecheck**

```bash
cd /Users/tomwu/Projects/project50 && pnpm typecheck 2>&1 | tail -30
```

Expected: 0 errors across all packages.

- [ ] **Step 2: Whole-repo lint**

```bash
cd /Users/tomwu/Projects/project50 && pnpm lint 2>&1 | tail -30
```

Expected: 0 warnings.

- [ ] **Step 3: Whole-repo vitest tests (core/ui/recap/web — separate from mobile Jest)**

```bash
cd /Users/tomwu/Projects/project50 && pnpm test 2>&1 | tail -40
```

Expected: vitest tests all green (these are the web/core/ui/recap packages — mobile is Jest, run separately).

- [ ] **Step 4: Web build**

```bash
cd /Users/tomwu/Projects/project50 && pnpm --filter @project50/web build 2>&1 | tail -20
```

Expected: exit 0.

- [ ] **Step 5: Frozen-lockfile install check**

```bash
cd /Users/tomwu/Projects/project50 && pnpm install --frozen-lockfile 2>&1 | tail -10
```

Expected: exit 0 (lockfile is up to date with the new deps).

---

### Task 9: Update root `README.md` + final commits

**Files:**
- Modify: `README.md` (root)

- [ ] **Step 1: Add "Native app (Expo)" section to README.md**

Open `/Users/tomwu/Projects/project50/README.md`. After the "Tech stack" table, add a new section. Also update the Roadmap to mark C complete and note A–E done.

Insert after the tech stack table:

```markdown
## Native app (Expo)

`apps/mobile` is a React Native (Expo SDK 52) app that delivers the core project50 flows on mobile.

**Status:** Code-complete + unit-tested with Jest/RNTL. Reuses `@project50/core` domain logic and the same REST API as the web app. On-device run and device/e2e verification are pending simulator access.

| Feature | Status |
|---------|--------|
| API client (all endpoints) | Tested (Jest, fetch mocked) |
| Session / auth | Tested (SecureStore + OAuth wired) |
| Dashboard screen | Tested (RNTL) |
| Log Activity screen (photo upload) | Tested (RNTL) |
| Feed screen (cheer + optimistic update) | Tested (RNTL) |
| Celebrate screen (recap generate + share) | Tested (RNTL) |
| React Navigation stack | Wired (native-glue exclusion) |

**Run on device / simulator:**
```bash
pnpm --filter @project50/mobile start   # opens Expo Go / development build
```

**Tests (headless Jest, no simulator required):**
```bash
pnpm --filter @project50/mobile test
```

Coverage gate: 99% on `src/lib/**`, `src/viewmodels/**`, `src/components/**`, `src/screens/**`. Native-only glue (navigator container, `registerRootComponent`, picker/share native call sites) is excluded and documented in [`apps/mobile/COVERAGE.md`](apps/mobile/COVERAGE.md).
```

Update the Roadmap section. Find the `- [ ] **Increment 3` line and after it add:

```markdown
- [x] **Sub-project C — Native iOS/Android (Expo):** `apps/mobile` — code-complete + unit-tested; screens: Dashboard, Log Activity (photo), Feed (cheer), Celebrate (recap + share); React Navigation wired; device verification pending simulator.
```

Also add a final note marking the A–E program complete:

```markdown
**A–E program: COMPLETE at the code level.** All sub-projects (A: backend, B: web PWA, C: native, D: social publishing, E: recap engine) are implemented and unit-tested. On-device / e2e verification of the native app (C) is the one remaining open item pending simulator access.
```

- [ ] **Step 2: Commit 1 — Feed + Celebrate + share**

```bash
cd /Users/tomwu/Projects/project50 && git add \
  apps/mobile/src/lib/share.ts \
  apps/mobile/src/lib/share.test.ts \
  apps/mobile/src/screens/FeedScreen.tsx \
  apps/mobile/src/screens/FeedScreen.test.tsx \
  apps/mobile/src/screens/CelebrateScreen.tsx \
  apps/mobile/src/screens/CelebrateScreen.test.tsx \
  apps/mobile/package.json \
  apps/mobile/jest.config.js \
  pnpm-lock.yaml

git commit -m "feat(mobile): feed + celebrate + share"
```

- [ ] **Step 3: Commit 2 — Navigation + program complete**

```bash
cd /Users/tomwu/Projects/project50 && git add \
  apps/mobile/src/navigation/AppNavigator.tsx \
  apps/mobile/App.tsx \
  apps/mobile/COVERAGE.md \
  README.md

git commit -m "feat(mobile): navigation + program complete"
```

---

## Self-Review

**Spec coverage:**
- `src/lib/share.ts` — created, tested (isAvailableAsync branch + native call sites excluded). ✓
- `src/screens/FeedScreen.tsx` — renders items, empty, cheer optimistic+revert, loading, error, photo. ✓
- `src/screens/CelebrateScreen.tsx` — stats, badges, generate (DAY/WEEK/FIFTY), shows url, share, loading, error. ✓
- Navigation wiring — `AppNavigator.tsx` + `App.tsx`, excluded with justification. ✓
- `expo-sharing` dep added. ✓
- COVERAGE.md updated. ✓
- README updated with native section + A–E program complete. ✓
- Two commits as specified. ✓
- No branch switch / push / PR. ✓

**Placeholder scan:** All steps have actual code. No "TBD" or "implement later".

**Type consistency:**
- `FeedActivity.media` → `media[0]?.url` — matches `ChallengeMedia.url` in apiClient.ts. ✓
- `RecapKind` — `"DAY" | "WEEK" | "FIFTY"` — matches apiClient.ts. ✓
- `CelebrateScreenProps.challengeId: string` — matches navigator params. ✓
- `LogActivityScreenProps` — imported from `LogActivityScreen.tsx`, passed through navigator correctly. ✓

**Coverage honesty:**
- `share.ts`: The `isAvailableAsync()` → branch is **tested**. Only the two `await ...shareAsync(url)` and `await Linking.openURL(url)` lines are excluded — they have zero own logic.
- `AppNavigator.tsx` + `App.tsx`: Whole-file `/* istanbul ignore file */` — no branching logic of our own.
- All screen state/handler logic is tested via RNTL (mocked apiClient + mocked share).
