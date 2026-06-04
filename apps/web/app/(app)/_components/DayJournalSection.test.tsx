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
});
