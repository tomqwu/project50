/**
 * Offline support for the project50 mobile app.
 *
 * Two concerns, both backed by `@react-native-async-storage/async-storage`:
 *
 *  1. A read cache (`cacheGet` / `cacheSet`) so screens can render the last
 *     known data when the device is offline.
 *  2. A durable write-queue (`enqueueMutation` / `flushQueue`) so writes made
 *     while offline (toggling a Project 50 rule, logging an activity) are
 *     replayed against the API when connectivity returns. The queue is cleared
 *     on success and kept on failure so nothing is lost.
 *
 * Connectivity is checked via `@react-native-community/netinfo`.
 *
 * Everything here takes its storage / net / api dependencies as injectable
 * arguments (defaulting to the real modules) so it is fully unit-testable in
 * Node without a device.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import type { ApiClient, LogActivityInput, LogActivityResult, Project50State } from "./apiClient";

// ─── Storage abstraction ──────────────────────────────────────────────────────

/** The slice of AsyncStorage's API we depend on — injectable for tests. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = "p50.cache.";

/** Namespaced storage key for a cache entry. */
function cacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

/**
 * Read a previously cached value, or `null` when nothing is cached / the stored
 * JSON is unparseable. Never throws for a missing or corrupt entry.
 */
export async function cacheGet<T>(
  key: string,
  store: KeyValueStore = AsyncStorage,
): Promise<T | null> {
  const raw = await store.getItem(cacheKey(key));
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Persist a value in the read cache under `key`. */
export async function cacheSet<T>(
  key: string,
  value: T,
  store: KeyValueStore = AsyncStorage,
): Promise<void> {
  await store.setItem(cacheKey(key), JSON.stringify(value));
}

// ─── Write queue ──────────────────────────────────────────────────────────────

const QUEUE_KEY = "p50.queue";

/** A queued Project 50 rule toggle. */
export interface ToggleRuleMutation {
  type: "toggleRule";
  ruleId: number;
  done: boolean;
}

/** A queued activity log against a challenge. */
export interface LogActivityMutation {
  type: "logActivity";
  challengeId: string;
  input: LogActivityInput;
}

/** A mutation queued while offline, to be replayed on reconnect. */
export type QueuedMutation = ToggleRuleMutation | LogActivityMutation;

/** Read the persisted mutation queue (empty array when none / corrupt). */
export async function getQueue(store: KeyValueStore = AsyncStorage): Promise<QueuedMutation[]> {
  const raw = await store.getItem(QUEUE_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

/** Overwrite the persisted mutation queue. */
async function setQueue(queue: QueuedMutation[], store: KeyValueStore): Promise<void> {
  await store.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Append a mutation to the durable write-queue. */
export async function enqueueMutation(
  mutation: QueuedMutation,
  store: KeyValueStore = AsyncStorage,
): Promise<void> {
  const queue = await getQueue(store);
  queue.push(mutation);
  await setQueue(queue, store);
}

/** Apply a single queued mutation against the API. */
async function applyMutation(mutation: QueuedMutation, api: ApiClient): Promise<void> {
  switch (mutation.type) {
    case "toggleRule":
      await api.toggleRule(mutation.ruleId, mutation.done);
      return;
    case "logActivity":
      await api.logActivity(mutation.challengeId, mutation.input);
      return;
    /* istanbul ignore next — exhaustive switch guard over a closed union */
    default:
      return;
  }
}

/** Outcome of a {@link flushQueue} run. */
export interface FlushResult {
  /** Number of mutations successfully replayed (and removed from the queue). */
  flushed: number;
  /** Number of mutations still pending (kept in the queue) after this run. */
  remaining: number;
}

/**
 * Replay queued mutations in order against the API.
 *
 * Mutations are applied oldest-first; each success is removed from the queue
 * immediately (persisted), so an interruption never re-applies an already-synced
 * write. On the first failure we stop and keep the remaining mutations (FIFO
 * ordering preserved) for a later retry.
 */
export async function flushQueue(
  api: ApiClient,
  store: KeyValueStore = AsyncStorage,
): Promise<FlushResult> {
  let queue = await getQueue(store);
  let flushed = 0;

  while (queue.length > 0) {
    const next = queue[0]!;
    try {
      await applyMutation(next, api);
    } catch {
      // Keep this and all subsequent mutations for the next attempt.
      break;
    }
    queue = queue.slice(1);
    await setQueue(queue, store);
    flushed += 1;
  }

  return { flushed, remaining: queue.length };
}

// ─── Connectivity ───────────────────────────────────────────────────────────

/** The slice of NetInfo we depend on — injectable for tests. */
export interface NetChecker {
  fetch(): Promise<{ isConnected: boolean | null }>;
}

/**
 * Resolve to `true` when the device currently has a network connection.
 * Treats an unknown (`null`) connectivity state as offline (conservative:
 * prefer queueing over a doomed request).
 */
export async function isOnline(net: NetChecker = NetInfo): Promise<boolean> {
  const state = await net.fetch();
  return state.isConnected === true;
}

// ─── High-level helpers wiring cache + queue + connectivity ────────────────────

/** Cache key for the Project 50 state. */
export const PROJECT50_STATE_CACHE_KEY = "project50.state";

export interface OfflineDeps {
  store?: KeyValueStore;
  net?: NetChecker;
}

/**
 * Load the Project 50 state with offline fallback:
 *  - Online: fetch fresh, refresh the cache, return it.
 *  - Offline (or a fetch error): return the last cached state, or `null`.
 *
 * Returns `{ state, fromCache }` so callers can surface an "offline" indicator.
 */
export async function loadProject50StateOffline(
  api: ApiClient,
  deps: OfflineDeps = {},
): Promise<{ state: Project50State | null; fromCache: boolean }> {
  const store = deps.store ?? AsyncStorage;
  const net = deps.net ?? NetInfo;

  if (await isOnline(net)) {
    try {
      const state = await api.getProject50State();
      await cacheSet(PROJECT50_STATE_CACHE_KEY, state, store);
      return { state, fromCache: false };
    } catch {
      // Network said online but the request failed — fall back to cache.
    }
  }

  const cached = await cacheGet<Project50State>(PROJECT50_STATE_CACHE_KEY, store);
  return { state: cached, fromCache: true };
}

/**
 * Toggle a Project 50 rule with offline support:
 *  - Online: call the API, return the fresh state, refresh the cache.
 *  - Offline: enqueue the toggle for later sync and return `{ queued: true }`.
 */
export async function toggleRuleOffline(
  api: ApiClient,
  ruleId: number,
  done: boolean,
  deps: OfflineDeps = {},
): Promise<{ state: Project50State | null; queued: boolean }> {
  const store = deps.store ?? AsyncStorage;
  const net = deps.net ?? NetInfo;

  if (await isOnline(net)) {
    const state = await api.toggleRule(ruleId, done);
    await cacheSet(PROJECT50_STATE_CACHE_KEY, state, store);
    return { state, queued: false };
  }

  await enqueueMutation({ type: "toggleRule", ruleId, done }, store);
  return { state: null, queued: true };
}

/**
 * Log an activity with offline support:
 *  - Online: call the API and return the result.
 *  - Offline: enqueue the activity log for later sync and return `{ queued: true }`.
 */
export async function logActivityOffline(
  api: ApiClient,
  challengeId: string,
  input: LogActivityInput,
  deps: OfflineDeps = {},
): Promise<{ result: LogActivityResult | null; queued: boolean }> {
  const store = deps.store ?? AsyncStorage;
  const net = deps.net ?? NetInfo;

  if (await isOnline(net)) {
    const result = await api.logActivity(challengeId, input);
    return { result, queued: false };
  }

  await enqueueMutation({ type: "logActivity", challengeId, input }, store);
  return { result: null, queued: true };
}

/**
 * Flush the queue if (and only if) the device is online. Returns `null` when
 * offline (nothing attempted), otherwise the {@link FlushResult}. Intended to
 * be called on reconnect.
 */
export async function syncOnReconnect(
  api: ApiClient,
  deps: OfflineDeps = {},
): Promise<FlushResult | null> {
  const store = deps.store ?? AsyncStorage;
  const net = deps.net ?? NetInfo;

  if (!(await isOnline(net))) {
    return null;
  }
  return flushQueue(api, store);
}
