import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockRequireUser, mockUpdateAccount, mockRevalidatePath } = vi.hoisted(
  () => ({
    mockRequireUser: vi.fn<() => Promise<string>>(),
    mockUpdateAccount: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }),
);

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/api/account", () => ({ updateAccount: mockUpdateAccount }));

import { HttpError } from "@/lib/api/http";
import { updateAccountAction } from "./actions";

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

  it("returns the error code for an HttpError (validation failure)", async () => {
    mockUpdateAccount.mockRejectedValue(new HttpError(422, "handle_taken"));

    const result = await updateAccountAction({ handle: "bob" });

    expect(result).toEqual({ ok: false, error: "handle_taken" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows unexpected (non-HttpError) errors", async () => {
    mockUpdateAccount.mockRejectedValue(new Error("db down"));

    await expect(updateAccountAction({ handle: "x" })).rejects.toThrow("db down");
  });
});
