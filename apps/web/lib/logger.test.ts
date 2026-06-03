import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, logger, serializeError } from "./logger";

const spies = {
  debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
  info: vi.spyOn(console, "info").mockImplementation(() => {}),
  warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
  error: vi.spyOn(console, "error").mockImplementation(() => {}),
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LOG_LEVEL = "debug"; // emit everything unless a test overrides
});

afterEach(() => {
  delete process.env.LOG_LEVEL;
});

/** Parse the single JSON line a spy was called with. */
function lastLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const arg = spy.mock.calls.at(-1)?.[0] as string;
  return JSON.parse(arg);
}

describe("createLogger", () => {
  it("emits one JSON line per level with level + msg + fields", () => {
    const log = createLogger();
    log.info("hello", { a: 1 });
    expect(spies.info).toHaveBeenCalledOnce();
    expect(lastLine(spies.info)).toEqual({ level: "info", msg: "hello", a: 1 });

    log.debug("d");
    log.warn("w");
    log.error("e");
    expect(lastLine(spies.debug)).toMatchObject({ level: "debug", msg: "d" });
    expect(lastLine(spies.warn)).toMatchObject({ level: "warn", msg: "w" });
    expect(lastLine(spies.error)).toMatchObject({ level: "error", msg: "e" });
  });

  it("suppresses messages below the configured LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    const log = createLogger();
    log.debug("nope");
    log.info("nope");
    log.warn("yes");
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledOnce();
  });

  it("silent suppresses everything; unknown LOG_LEVEL falls back to info", () => {
    process.env.LOG_LEVEL = "silent";
    createLogger().error("hidden");
    expect(spies.error).not.toHaveBeenCalled();

    process.env.LOG_LEVEL = "bogus";
    const log = createLogger();
    log.debug("below-info"); // info threshold → suppressed
    log.info("at-info");
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalledOnce();
  });

  it("defaults to the info level when LOG_LEVEL is unset", () => {
    delete process.env.LOG_LEVEL;
    const log = createLogger();
    log.debug("below"); // suppressed at default info
    log.info("at-info");
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalledOnce();
  });

  it("redacts sensitive field names", () => {
    createLogger().info("auth", {
      password: "p",
      token: "t",
      authorization: "Bearer x",
      cookie: "c",
      keep: "visible",
    });
    expect(lastLine(spies.info)).toEqual({
      level: "info",
      msg: "auth",
      password: "[redacted]",
      token: "[redacted]",
      authorization: "[redacted]",
      cookie: "[redacted]",
      keep: "visible",
    });
  });

  it("child merges base context, with call fields taking precedence", () => {
    const log = createLogger({ scope: "api" }).child({ route: "/x", scope: "api" });
    log.info("hit", { route: "/y" });
    expect(lastLine(spies.info)).toEqual({
      level: "info",
      msg: "hit",
      scope: "api",
      route: "/y",
    });
  });
});

describe("default logger", () => {
  it("is a usable Logger", () => {
    logger.warn("default");
    expect(lastLine(spies.warn)).toMatchObject({ level: "warn", msg: "default" });
  });
});

describe("serializeError", () => {
  it("extracts name/message/stack from an Error", () => {
    const out = serializeError(new TypeError("boom"));
    expect(out).toMatchObject({ name: "TypeError", message: "boom" });
    expect(typeof out.stack).toBe("string");
  });

  it("stringifies non-Error values", () => {
    expect(serializeError("plain")).toEqual({ value: "plain" });
    expect(serializeError(42)).toEqual({ value: "42" });
  });
});
