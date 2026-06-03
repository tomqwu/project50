/**
 * Structured logging (M0 #26).
 *
 * Emits one JSON object per line to the console, so a host/log-collector (or a
 * future error tracker) can parse, filter, and ship them. Keep it dependency-free
 * and deterministic — no timestamps (the collector stamps lines), no async.
 *
 * Level is controlled by LOG_LEVEL (debug|info|warn|error|silent), default info.
 * Sensitive field names are redacted so secrets/tokens never reach the logs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

type EmitLevel = Exclude<LogLevel, "silent">;

const SENSITIVE_KEY =
  /^(password|token|secret|authorization|cookie|set-cookie|client_secret|access_token|refresh_token)$/i;

const CONSOLE: Record<EmitLevel, (line: string) => void> = {
  debug: (line) => console.debug(line),
  info: (line) => console.info(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

function threshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_ORDER[raw as LogLevel] ?? LEVEL_ORDER.info;
}

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : value;
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  /** Derive a logger that always includes `context` (e.g. a route or request id). */
  child(context: Record<string, unknown>): Logger;
}

export function createLogger(base: Record<string, unknown> = {}): Logger {
  function emit(level: EmitLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < threshold()) return;
    const payload = { level, msg, ...redact({ ...base, ...fields }) };
    CONSOLE[level](JSON.stringify(payload));
  }
  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (context) => createLogger({ ...base, ...context }),
  };
}

/** Process-wide default logger. */
export const logger = createLogger();

/** Normalize an unknown thrown value into a plain, loggable shape. */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: String(err) };
}
