import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockRequireUser,
  mockUpdateAccount,
  mockDeleteAccount,
  mockRevalidatePath,
  mockSignOut,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockUpdateAccount: vi.fn(),
  mockDeleteAccount: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/api/account", () => ({
  updateAccount: mockUpdateAccount,
  deleteAccount: mockDeleteAccount,
}));
vi.mock("@/auth", () => ({ signOut: mockSignOut }));

import { HttpError } from "@/lib/api/http";
import { updateAccountAction, deleteAccountAction } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireUser.mockResolvedValue("u1");
});

describe("updateAccountAction", () => {
  it("updates the account and revalidates on success", async () => {
    mockUpdateAccount.mockResolvedValue({
      handle: "alice_b",
      displayName: "Alice B",
    });

    const result = await updateAccountAction({
      displayName: "Alice B",
      handle: "alice_b",
    });

    expect(mockUpdateAccount).toHaveBeenCalledWith("u1", {
      displayName: "Alice B",
      handle: "alice_b",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings");
    expect(result).toEqual({
      ok: true,
      account: { handle: "alice_b", displayName: "Alice B" },
    });
  });

  it("returns the error code for an HttpError without logging it as an error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUpdateAccount.mockRejectedValue(new HttpError(422, "handle_taken"));

    const result = await updateAccountAction({ handle: "bob" });

    expect(result).toEqual({ ok: false, error: "handle_taken" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
    // Expected/validation failures must not be logged at error level.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs and rethrows unexpected (non-HttpError) errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "error";
    mockUpdateAccount.mockRejectedValue(new Error("db down"));

    await expect(updateAccountAction({ handle: "x" })).rejects.toThrow("db down");

    expect(errorSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      level: "error",
      msg: "server action failed",
      scope: "action",
      action: "updateAccountAction",
      error: { name: "Error", message: "db down" },
    });

    errorSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });
});

describe("deleteAccountAction", () => {
  it("deletes the account then signs out and redirects to /signin", async () => {
    await deleteAccountAction();

    expect(mockDeleteAccount).toHaveBeenCalledWith("u1");
    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/signin" });
    // sign-out happens only after deletion succeeds
    const deleteOrder = mockDeleteAccount.mock.invocationCallOrder[0]!;
    const signOutOrder = mockSignOut.mock.invocationCallOrder[0]!;
    expect(deleteOrder).toBeLessThan(signOutOrder);
  });

  it("logs and does not sign out when deletion fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "error";
    mockDeleteAccount.mockRejectedValueOnce(new Error("db down"));

    await expect(deleteAccountAction()).rejects.toThrow("db down");
    expect(mockSignOut).not.toHaveBeenCalled();

    expect(errorSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      scope: "action",
      action: "deleteAccountAction",
      error: { name: "Error", message: "db down" },
    });

    errorSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });
});
