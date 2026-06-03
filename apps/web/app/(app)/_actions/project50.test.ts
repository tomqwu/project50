import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockRequireUser,
  mockStartProject50,
  mockToggleRule,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockStartProject50: vi.fn(),
  mockToggleRule: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/project50", () => ({
  startProject50: mockStartProject50,
  toggleRule: mockToggleRule,
}));

import { startProject50Action, toggleRuleAction } from "./project50";

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireUser.mockResolvedValue("u1");
});

describe("startProject50Action", () => {
  it("starts the program for the user and revalidates", async () => {
    await startProject50Action("America/Toronto");

    expect(mockStartProject50).toHaveBeenCalledWith("u1", "America/Toronto");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("logs and rethrows when the program fails to start", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "error";
    mockStartProject50.mockRejectedValueOnce(new Error("db down"));

    await expect(startProject50Action("UTC")).rejects.toThrow("db down");

    expect(errorSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      level: "error",
      msg: "server action failed",
      scope: "action",
      action: "startProject50Action",
      error: { name: "Error", message: "db down" },
    });

    errorSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });
});

describe("toggleRuleAction", () => {
  it("toggles the rule for the user and revalidates", async () => {
    await toggleRuleAction(3, true);

    expect(mockToggleRule).toHaveBeenCalledWith("u1", 3, true);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("logs and rethrows when toggling the rule fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "error";
    mockToggleRule.mockRejectedValueOnce(new Error("write failed"));

    await expect(toggleRuleAction(2, false)).rejects.toThrow("write failed");

    expect(errorSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      scope: "action",
      action: "toggleRuleAction",
      error: { name: "Error", message: "write failed" },
    });

    errorSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });
});
