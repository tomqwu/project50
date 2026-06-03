import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { withActionLogging } from "./log-action";

beforeEach(() => {
  process.env.LOG_LEVEL = "error";
});

afterEach(() => {
  delete process.env.LOG_LEVEL;
  vi.restoreAllMocks();
});

describe("withActionLogging", () => {
  it("passes through the return value on success without logging", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await withActionLogging("doThing", async () => 42)();

    expect(result).toBe(42);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("forwards arguments to the wrapped function", async () => {
    const fn = vi.fn(async (a: number, b: string) => `${a}-${b}`);

    const wrapped = withActionLogging("doThing", fn);
    const result = await wrapped(7, "x");

    expect(fn).toHaveBeenCalledWith(7, "x");
    expect(result).toBe("7-x");
  });

  it("logs an unexpected error with structured context then rethrows", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("db down");

    await expect(
      withActionLogging("startProject50Action", async () => {
        throw boom;
      })(),
    ).rejects.toThrow("db down");

    expect(errorSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      level: "error",
      msg: "server action failed",
      scope: "action",
      action: "startProject50Action",
      error: { name: "Error", message: "db down" },
    });
  });

  it("serializes non-Error throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      withActionLogging("toggleRuleAction", async () => {
        throw "string failure";
      })(),
    ).rejects.toBe("string failure");

    const line = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      scope: "action",
      action: "toggleRuleAction",
      error: { value: "string failure" },
    });
  });
});
