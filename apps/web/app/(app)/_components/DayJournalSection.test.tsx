import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { DayJournalSection } from "./DayJournalSection";

afterEach(() => cleanup());

/** A deferred promise so a test can control when a save resolves/rejects. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("DayJournalSection", () => {
  it("renders empty textareas when there is no saved journal", () => {
    render(<DayJournalSection onSave={vi.fn().mockResolvedValue(undefined)} />);
    const wins = screen.getByLabelText(/today's wins/i) as HTMLTextAreaElement;
    const lessons = screen.getByLabelText(/what i learned/i) as HTMLTextAreaElement;
    expect(wins.value).toBe("");
    expect(lessons.value).toBe("");
  });

  it("prefills the textareas from the saved journal", () => {
    render(
      <DayJournalSection
        journal={{ wins: "ran 5k", lessons: "start earlier" }}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect((screen.getByLabelText(/today's wins/i) as HTMLTextAreaElement).value).toBe("ran 5k");
    expect((screen.getByLabelText(/what i learned/i) as HTMLTextAreaElement).value).toBe(
      "start earlier",
    );
  });

  it("typing then Save calls onSave(wins, lessons) and shows the saved confirmation after it resolves", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<DayJournalSection onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "won today" } });
    fireEvent.change(screen.getByLabelText(/what i learned/i), { target: { value: "lesson" } });
    fireEvent.click(screen.getByTestId("journal-save"));

    expect(onSave).toHaveBeenCalledWith("won today", "lesson");
    expect(await screen.findByTestId("journal-saved")).toBeInTheDocument();
    expect(screen.queryByTestId("journal-error")).not.toBeInTheDocument();
  });

  it("does NOT show 'Saved' until the save resolves — and disables Save while in flight", async () => {
    const d = deferred();
    const onSave = vi.fn().mockReturnValue(d.promise);
    render(<DayJournalSection onSave={onSave} />);

    fireEvent.click(screen.getByTestId("journal-save"));
    // While the promise is pending: button disabled, no confirmation yet.
    await waitFor(() => expect(screen.getByTestId("journal-save")).toBeDisabled());
    expect(screen.queryByTestId("journal-saved")).not.toBeInTheDocument();

    d.resolve();
    expect(await screen.findByTestId("journal-saved")).toBeInTheDocument();
    expect(screen.getByTestId("journal-save")).not.toBeDisabled();
  });

  it("a rejected save shows an error and does NOT show 'Saved'", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("no run"));
    render(<DayJournalSection onSave={onSave} />);

    fireEvent.click(screen.getByTestId("journal-save"));

    expect(await screen.findByTestId("journal-error")).toBeInTheDocument();
    expect(screen.queryByTestId("journal-saved")).not.toBeInTheDocument();
    // re-enabled so the user can retry
    expect(screen.getByTestId("journal-save")).not.toBeDisabled();
  });

  it("editing after a successful save clears the saved confirmation", async () => {
    render(<DayJournalSection onSave={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByTestId("journal-save"));
    expect(await screen.findByTestId("journal-saved")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "more" } });
    expect(screen.queryByTestId("journal-saved")).not.toBeInTheDocument();
  });

  it("editing after a failed save clears the error", async () => {
    render(<DayJournalSection onSave={vi.fn().mockRejectedValue(new Error("x"))} />);
    fireEvent.click(screen.getByTestId("journal-save"));
    expect(await screen.findByTestId("journal-error")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/what i learned/i), { target: { value: "retry" } });
    expect(screen.queryByTestId("journal-error")).not.toBeInTheDocument();
  });

  it("does NOT confirm 'Saved' when the user edits while the save is in flight", async () => {
    const d = deferred();
    const onSave = vi.fn().mockReturnValue(d.promise);
    render(<DayJournalSection onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "first" } });
    fireEvent.click(screen.getByTestId("journal-save"));
    expect(onSave).toHaveBeenCalledWith("first", "");

    // The user keeps typing before the slow save resolves.
    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "first + more" } });

    d.resolve();
    // The save that resolved was for "first", but the field now says "first + more",
    // so we must NOT claim it is saved.
    await waitFor(() => expect(screen.getByTestId("journal-save")).not.toBeDisabled());
    expect(screen.queryByTestId("journal-saved")).not.toBeInTheDocument();
  });

  it("still confirms 'Saved' when an in-flight edit is reverted back to the submitted value", async () => {
    const d = deferred();
    const onSave = vi.fn().mockReturnValue(d.promise);
    render(<DayJournalSection onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "won" } });
    fireEvent.click(screen.getByTestId("journal-save"));

    // Edit then revert to exactly what was submitted.
    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "won more" } });
    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "won" } });

    d.resolve();
    expect(await screen.findByTestId("journal-saved")).toBeInTheDocument();
  });

  it("resets the editor and saved flag when the active day changes", async () => {
    const { rerender } = render(
      <DayJournalSection
        dayKey="2026-06-03"
        journal={{ wins: "ran 5k", lessons: "start earlier" }}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    // Confirm a save so the "✓ Saved" flag is set.
    fireEvent.click(screen.getByTestId("journal-save"));
    expect(await screen.findByTestId("journal-saved")).toBeInTheDocument();

    // The day rolls over under the mounted dashboard: new dayKey + fresh journal.
    rerender(
      <DayJournalSection dayKey="2026-06-04" onSave={vi.fn().mockResolvedValue(undefined)} />,
    );

    expect((screen.getByLabelText(/today's wins/i) as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText(/what i learned/i) as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByTestId("journal-saved")).not.toBeInTheDocument();
  });

  it("does not leak unsaved edits across a day change, and saves under the new day", () => {
    const onSaveDay1 = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <DayJournalSection dayKey="2026-06-03" onSave={onSaveDay1} />,
    );
    // Unsaved edit on day 1.
    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "stale" } });

    // Day rolls over before the user saved.
    const onSaveDay2 = vi.fn().mockResolvedValue(undefined);
    rerender(<DayJournalSection dayKey="2026-06-04" onSave={onSaveDay2} />);

    expect((screen.getByLabelText(/today's wins/i) as HTMLTextAreaElement).value).toBe("");

    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "new day" } });
    fireEvent.click(screen.getByTestId("journal-save"));
    expect(onSaveDay2).toHaveBeenCalledWith("new day", "");
    expect(onSaveDay1).not.toHaveBeenCalled();
  });
});
