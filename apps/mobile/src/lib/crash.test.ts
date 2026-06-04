/**
 * Tests for crash.ts — env-gated Sentry crash/error reporting.
 *
 * The native @sentry/react-native module can't run under jest, so we mock its
 * surface (`init`, `captureException`). The whole point of this module is the
 * DSN gating, so we exercise both the configured (DSN passed) and unconfigured
 * (no DSN — dev/CI/Expo Go) paths, plus captureError before and after init.
 *
 * crash.ts holds a module-level `initialized` flag, so each test loads a fresh
 * copy via jest.isolateModules() and grabs the matching Sentry mock from the
 * same isolated module registry (so the mock the test asserts on is the exact
 * one the SUT calls). The DSN is passed explicitly: babel-preset-expo inlines
 * EXPO_PUBLIC_* reads, so it can't be driven through process.env in tests (same
 * reason push.ts takes an injectable param) — but the default-arg path that reads
 * process.env is still covered by the "uses the env DSN by default" test.
 */

jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

const DSN = "https://abc@o1.ingest.sentry.io/2";

type Crash = typeof import("./crash");
type SentryMock = { init: jest.Mock; captureException: jest.Mock };

/** Fresh crash module + the Sentry mock it is bound to, in an isolated registry. */
function load(): { crash: Crash; Sentry: SentryMock } {
  let crash!: Crash;
  let Sentry!: SentryMock;
  jest.isolateModules(() => {
    Sentry = require("@sentry/react-native") as SentryMock;
    crash = require("./crash") as Crash;
  });
  return { crash, Sentry };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("initCrashReporting", () => {
  it("calls Sentry.init with the DSN when one is configured", () => {
    const { crash, Sentry } = load();

    crash.initCrashReporting(DSN);

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: DSN }),
    );
  });

  it("uses the EXPO_PUBLIC_SENTRY_DSN env default when no arg is passed", () => {
    // Exercises the default-parameter path. Under jest the inlined env is unset,
    // so this also asserts the no-op-without-DSN behavior of the default.
    const { crash, Sentry } = load();

    crash.initCrashReporting();

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("is a no-op (never inits) when the DSN is undefined", () => {
    const { crash, Sentry } = load();

    crash.initCrashReporting(undefined);

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("is a no-op when the DSN is an empty string", () => {
    const { crash, Sentry } = load();

    crash.initCrashReporting("");

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("only initializes once even if called repeatedly", () => {
    const { crash, Sentry } = load();

    crash.initCrashReporting(DSN);
    crash.initCrashReporting(DSN);

    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });
});

describe("captureError", () => {
  it("forwards to Sentry.captureException once initialized with a DSN", () => {
    const { crash, Sentry } = load();
    crash.initCrashReporting(DSN);

    const err = new Error("boom");
    crash.captureError(err);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it("is a no-op when crash reporting was never initialized (no DSN)", () => {
    const { crash, Sentry } = load();
    crash.initCrashReporting(undefined);

    crash.captureError(new Error("boom"));

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
