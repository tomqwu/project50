import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockRequireUser, mockUpsertJournal, mockRevalidatePath } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockUpsertJournal: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/journal", () => ({ upsertJournal: mockUpsertJournal }));

import { saveJournalAction } from "./journal";

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireUser.mockResolvedValue("u1");
});

describe("saveJournalAction", () => {
  it("upserts the user's journal entry under the submitted dayKey and revalidates", async () => {
    await saveJournalAction("ran 5k", "start earlier", "2026-06-02");

    expect(mockUpsertJournal).toHaveBeenCalledWith(
      "u1",
      { wins: "ran 5k", lessons: "start earlier" },
      expect.any(Date),
      "2026-06-02",
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("forwards an undefined dayKey when the client omits it", async () => {
    await saveJournalAction("w", "l");

    expect(mockUpsertJournal).toHaveBeenCalledWith(
      "u1",
      { wins: "w", lessons: "l" },
      expect.any(Date),
      undefined,
    );
  });

  it("logs and rethrows when saving the journal fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "error";
    mockUpsertJournal.mockRejectedValueOnce(new Error("no run"));

    await expect(saveJournalAction("w", "l")).rejects.toThrow("no run");

    expect(errorSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      scope: "action",
      action: "saveJournalAction",
      error: { name: "Error", message: "no run" },
    });

    errorSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });
});
