import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DayJournalSection } from "./DayJournalSection";

afterEach(() => cleanup());

describe("DayJournalSection", () => {
  it("renders empty textareas when there is no saved journal", () => {
    render(<DayJournalSection onSave={vi.fn()} />);
    const wins = screen.getByLabelText(/today's wins/i) as HTMLTextAreaElement;
    const lessons = screen.getByLabelText(/what i learned/i) as HTMLTextAreaElement;
    expect(wins.value).toBe("");
    expect(lessons.value).toBe("");
  });

  it("prefills the textareas from the saved journal", () => {
    render(
      <DayJournalSection journal={{ wins: "ran 5k", lessons: "start earlier" }} onSave={vi.fn()} />,
    );
    expect((screen.getByLabelText(/today's wins/i) as HTMLTextAreaElement).value).toBe("ran 5k");
    expect((screen.getByLabelText(/what i learned/i) as HTMLTextAreaElement).value).toBe(
      "start earlier",
    );
  });

  it("typing then Save calls onSave(wins, lessons) and shows the saved confirmation", () => {
    const onSave = vi.fn();
    render(<DayJournalSection onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "won today" } });
    fireEvent.change(screen.getByLabelText(/what i learned/i), { target: { value: "lesson" } });
    fireEvent.click(screen.getByTestId("journal-save"));

    expect(onSave).toHaveBeenCalledWith("won today", "lesson");
    expect(screen.getByTestId("journal-saved")).toBeInTheDocument();
  });

  it("editing after a save clears the saved confirmation", () => {
    render(<DayJournalSection onSave={vi.fn()} />);
    fireEvent.click(screen.getByTestId("journal-save"));
    expect(screen.getByTestId("journal-saved")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/today's wins/i), { target: { value: "more" } });
    expect(screen.queryByTestId("journal-saved")).not.toBeInTheDocument();
  });

  it("disables the Save button while a save is pending", () => {
    render(<DayJournalSection onSave={vi.fn()} pending />);
    expect(screen.getByTestId("journal-save")).toBeDisabled();
  });
});
