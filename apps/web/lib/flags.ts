/**
 * Lightweight feature-flag + A/B framework (#126).
 *
 * No external service: flags are declared in a typed registry with compile-time
 * defaults, and any flag can be overridden at runtime via an environment
 * variable. A/B experiments use a pure, deterministic hash so a given user is
 * always bucketed into the same variant — no storage, no network.
 *
 * ─── Adding a flag ────────────────────────────────────────────────────────
 *   1. Add an entry to `FLAGS` below, e.g.
 *        myFeature: { default: false, clientSafe: false },
 *   2. Gate code with `isFlagEnabled("myFeature")` (server) or read it from
 *        `getClientFlags()` (client, only if `clientSafe: true`).
 *   3. Override per-environment with `FLAG_MY_FEATURE=true` (camelCase →
 *        UPPER_SNAKE, prefixed with `FLAG_`). Accepts true/false/1/0,
 *        case-insensitive; anything else falls back to the default.
 *
 * ─── Adding an experiment ─────────────────────────────────────────────────
 *   Call `assignVariant("experiment-key", userId, ["control", "treatment"])`.
 *   The result is stable for a (key, user) pair and deterministic across
 *   processes, so server and client agree without coordination.
 */

/** Definition of a single feature flag. */
export interface FlagDefinition {
  /** Value used when no environment override is present. */
  readonly default: boolean;
  /**
   * Whether this flag is safe to expose to the browser. Server-only flags
   * (e.g. ones gating privileged behaviour) must stay `false` so they are
   * never leaked via `getClientFlags()`.
   */
  readonly clientSafe: boolean;
}

/**
 * The flag registry. Keys are camelCase; their env-override variable is the
 * UPPER_SNAKE form prefixed with `FLAG_` (see `envVarFor`).
 *
 * Flags default OFF so merging a new flag never changes behaviour until it is
 * explicitly enabled.
 */
export const FLAGS = {
  /** Server-gated experimental onboarding flow (demo gate, default off). */
  newOnboarding: { default: false, clientSafe: false },
  /** Client-visible marketing banner toggle (default off). */
  publicBanner: { default: false, clientSafe: true },
} as const satisfies Record<string, FlagDefinition>;

export type FlagName = keyof typeof FLAGS;

/** Resolved on/off state for every flag. */
export type FlagState = Record<FlagName, boolean>;

/** camelCase flag name → `FLAG_UPPER_SNAKE` environment variable name. */
function envVarFor(name: FlagName): string {
  const snake = name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
  return `FLAG_${snake}`;
}

/**
 * Parse an environment override into a boolean. Recognizes
 * `true/false/1/0` (case-insensitive, trimmed). Returns `undefined` for
 * unset or unrecognized values so the caller can fall back to the default.
 */
function parseOverride(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return undefined;
}

/**
 * Returns whether a flag is enabled. An env override (`FLAG_<NAME>`) wins over
 * the registry default. `env` is injectable for tests; it defaults to
 * `process.env`.
 */
export function isFlagEnabled(name: FlagName, env: NodeJS.ProcessEnv = process.env): boolean {
  const override = parseOverride(env[envVarFor(name)]);
  return override ?? FLAGS[name].default;
}

/** Resolves the on/off state of every registered flag. */
export function getFlags(env: NodeJS.ProcessEnv = process.env): FlagState {
  const out = {} as FlagState;
  for (const name of Object.keys(FLAGS) as FlagName[]) {
    out[name] = isFlagEnabled(name, env);
  }
  return out;
}

/**
 * Resolves only the client-safe flags, suitable for serialization to the
 * browser. Server-only flags are omitted entirely so their state never leaks.
 */
export function getClientFlags(env: NodeJS.ProcessEnv = process.env): Partial<FlagState> {
  const out: Partial<FlagState> = {};
  for (const name of Object.keys(FLAGS) as FlagName[]) {
    if (FLAGS[name].clientSafe) {
      out[name] = isFlagEnabled(name, env);
    }
  }
  return out;
}

/**
 * 32-bit FNV-1a string hash. Pure and deterministic across processes/runtimes,
 * which is what makes A/B bucketing stable everywhere.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit unsigned space via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministically assigns a user to one of `variants` for an experiment.
 *
 * The same `(experimentKey, userId)` always yields the same variant, and the
 * `experimentKey` is mixed into the hash so independent experiments bucket
 * users independently. Pure: no env, no storage, no randomness.
 *
 * @throws if `variants` is empty.
 */
export function assignVariant<T>(experimentKey: string, userId: string, variants: readonly T[]): T {
  if (variants.length === 0) {
    throw new Error("assignVariant requires at least one variant");
  }
  const index = fnv1a(`${experimentKey}:${userId}`) % variants.length;
  // index is in [0, length) because length >= 1 (checked above) and modulo is non-negative.
  return variants[index] as T;
}
