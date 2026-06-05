import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Project50State, Project50DayMediaItem } from "@/lib/project50";
import { Project50View } from "./Project50View";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Build an ACTIVE state whose `today` carries the given media list. */
function activeStateWithMedia(media: Project50DayMediaItem[]): Project50State {
  return {
    status: "ACTIVE",
    runId: "r1",
    today: {
      dayKey: "2026-06-02",
      dayNumber: 3,
      checks: [false, false, false, false, false, false, false],
      completedCount: 0,
      media,
    },
  };
}

/** A File whose `.type` we can control (jsdom File honours the options.type). */
function fakeFile(name: string, type: string): File {
  return new File(["x"], name, { type });
}

describe("Project50View", () => {
  it("NONE: renders the start choice with both options", () => {
    render(<Project50View state={{ status: "NONE" }} onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByRole("button", { name: /start project 50/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /custom plan/i })).toHaveAttribute("href", "/challenges/new");
  });

  it("ACTIVE: renders Day n/50, 7 rule rows, and toggles a rule", () => {
    const onToggle = vi.fn();
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-06-02", dayNumber: 3, checks: [true,false,false,false,false,false,false], completedCount: 1, media: [] } }}
        onStart={vi.fn()} onToggle={onToggle} onRestart={vi.fn()}
      />,
    );
    expect(screen.getByText(/Day 3 \/ 50/)).toBeInTheDocument();
    expect(screen.getAllByTestId(/rule-row-/)).toHaveLength(7);
    fireEvent.click(screen.getByTestId("rule-row-2"));
    expect(onToggle).toHaveBeenCalledWith(2, true); // rule 2 was unchecked → toggles to true
  });

  it("ACTIVE incomplete: shows progress with remaining count and the restart warning, no completion banner", () => {
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-06-02", dayNumber: 3, checks: [true,true,false,false,false,false,false], completedCount: 2, media: [] } }}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 \/ 7 today/)).toBeInTheDocument();
    expect(screen.getByText(/5 to go/)).toBeInTheDocument();
    expect(screen.getByText(/restart at Day 1/i)).toBeInTheDocument();
    expect(screen.queryByTestId("day-complete-banner")).not.toBeInTheDocument();
  });

  it("ACTIVE complete (7/7, mid-program): shows the day-complete banner with next-day guidance and drops the restart warning", () => {
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-06-02", dayNumber: 3, checks: [true,true,true,true,true,true,true], completedCount: 7, media: [] } }}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
      />,
    );
    const banner = screen.getByTestId("day-complete-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Day 3 complete/i);
    expect(banner).toHaveTextContent(/7 \/ 7/);
    // tells the user what's next
    expect(banner).toHaveTextContent(/come back tomorrow for Day 4 of 50/i);
    expect(banner).toHaveTextContent(/47 days to go/i);
    // the anxiety-inducing restart warning is gone once the day is locked in
    expect(screen.queryByText(/restart at Day 1/i)).not.toBeInTheDocument();
    // rules remain togglable (in case of a mistake) — checklist still rendered
    expect(screen.getAllByTestId(/rule-row-/)).toHaveLength(7);
  });

  it("ACTIVE complete on the final day (Day 50, 7/7): shows a final-day message instead of next-day guidance", () => {
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-07-21", dayNumber: 50, checks: [true,true,true,true,true,true,true], completedCount: 7, media: [] } }}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
      />,
    );
    const banner = screen.getByTestId("day-complete-banner");
    expect(banner).toHaveTextContent(/Day 50 complete/i);
    expect(banner).toHaveTextContent(/final day/i);
    expect(banner).not.toHaveTextContent(/come back tomorrow/i);
  });

  it("ACTIVE complete one day before the end (Day 49, 7/7): 'day to go' is singular", () => {
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-07-20", dayNumber: 49, checks: [true,true,true,true,true,true,true], completedCount: 7, media: [] } }}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
      />,
    );
    const banner = screen.getByTestId("day-complete-banner");
    expect(banner).toHaveTextContent(/come back tomorrow for Day 50 of 50/i);
    expect(banner).toHaveTextContent(/1 day to go/i);
    expect(banner).not.toHaveTextContent(/days to go/i);
  });

  it("ACTIVE: info button toggles help panel without toggling the rule", () => {
    const onToggle = vi.fn();
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-06-02", dayNumber: 3, checks: [false,false,false,false,false,false,false], completedCount: 0, media: [] } }}
        onStart={vi.fn()} onToggle={onToggle} onRestart={vi.fn()}
      />,
    );
    // help panel hidden initially
    expect(screen.queryByTestId("rule-help-panel-3")).not.toBeInTheDocument();
    const helpBtn = screen.getByTestId("rule-help-3");
    fireEvent.click(helpBtn);
    // panel now visible and shows the rule detail
    const panel = screen.getByTestId("rule-help-panel-3");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(/1 hour, any activity/i);
    // clicking the info button must NOT toggle the rule
    expect(onToggle).not.toHaveBeenCalled();
    // clicking again collapses the panel
    fireEvent.click(helpBtn);
    expect(screen.queryByTestId("rule-help-panel-3")).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("ACTIVE: opening help for another rule replaces the open panel, toggle still works", () => {
    const onToggle = vi.fn();
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-06-02", dayNumber: 5, checks: [false,false,false,false,false,false,false], completedCount: 0, media: [] } }}
        onStart={vi.fn()} onToggle={onToggle} onRestart={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("rule-help-1"));
    expect(screen.getByTestId("rule-help-panel-1")).toBeInTheDocument();
    // open a different rule's help → first one closes
    fireEvent.click(screen.getByTestId("rule-help-4"));
    expect(screen.queryByTestId("rule-help-panel-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("rule-help-panel-4")).toBeInTheDocument();
    // the toggle row still works independently
    fireEvent.click(screen.getByTestId("rule-row-1"));
    expect(onToggle).toHaveBeenCalledWith(1, true);
  });

  it("COMPLETED: shows the celebration with the 50-day achievement and no checklist", () => {
    render(
      <Project50View
        state={{ status: "COMPLETED", runId: "r1", completedDays: 50 }}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
      />,
    );
    expect(screen.getByText(/finished project 50/i)).toBeInTheDocument();
    expect(screen.getByText(/50 days/i)).toBeInTheDocument();
    // no checklist rows in the terminal celebration
    expect(screen.queryByTestId(/rule-row-/)).not.toBeInTheDocument();
    // a way to start a custom plan
    expect(screen.getByRole("link", { name: /custom plan/i })).toHaveAttribute("href", "/challenges/new");
  });

  it("COMPLETED: restart button starts a new run", () => {
    const onRestart = vi.fn();
    render(
      <Project50View
        state={{ status: "COMPLETED", runId: "r1", completedDays: 50 }}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={onRestart}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /again/i }));
    expect(onRestart).toHaveBeenCalled();
  });

  it("FAILED: shows the missed day + rule and a restart button", () => {
    const onRestart = vi.fn();
    render(<Project50View state={{ status: "FAILED", failedDayNumber: 12, failedRuleId: 3 }} onStart={vi.fn()} onToggle={vi.fn()} onRestart={onRestart} />);
    expect(screen.getByText(/Day 12/)).toBeInTheDocument();
    expect(screen.getByText(/Exercise/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /start over/i }));
    expect(onRestart).toHaveBeenCalled();
  });
});

describe("Project50View — today's photo section", () => {
  const readDimensions = () => Promise.resolve({ width: 640, height: 480 });

  it("renders the heading and the add-photo control in the ACTIVE state", () => {
    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
      />,
    );
    expect(screen.getByText(/today's photo/i)).toBeInTheDocument();
    expect(screen.getByTestId("today-photo-add")).toHaveTextContent(/add photo/i);
    // no thumbnails when there are no photos yet
    expect(screen.queryByTestId("today-photo-strip")).not.toBeInTheDocument();
  });

  it("renders a thumbnail strip of today's photos with alt text and signed urls", () => {
    render(
      <Project50View
        state={activeStateWithMedia([
          { id: "m1", objectKey: "k1", width: 10, height: 10, url: "https://cdn/k1" },
          { id: "m2", objectKey: "k2", width: 20, height: 20, url: "https://cdn/k2" },
        ])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
      />,
    );
    const thumbs = screen.getAllByTestId("today-photo-thumb");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAttribute("src", "https://cdn/k1");
    expect(thumbs[0]).toHaveAttribute("alt", "Today's photo 1");
    expect(thumbs[1]).toHaveAttribute("src", "https://cdn/k2");
  });

  it("uploads a chosen image (presign → PUT) then calls onAttachMedia", async () => {
    const onAttachMedia = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: "https://put.example/obj",
          objectKey: "media/u/obj.jpg",
          uploadHeaders: { "content-type": "image/jpeg" },
        }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onAttachMedia={onAttachMedia}
        readDimensions={readDimensions}
      />,
    );

    fireEvent.change(screen.getByTestId("today-photo-input"), {
      target: { files: [fakeFile("photo.jpg", "image/jpeg")] },
    });

    await waitFor(() =>
      expect(onAttachMedia).toHaveBeenCalledWith("media/u/obj.jpg", 640, 480),
    );
    // presign request body carries the content type
    const presignCall = fetchMock.mock.calls[0]!;
    expect(presignCall[0]).toBe("/api/uploads/presign");
    expect(JSON.parse(presignCall[1].body)).toMatchObject({ contentType: "image/jpeg" });
    // PUT goes to the presigned url with the file bytes + presign headers
    expect(fetchMock.mock.calls[1]![0]).toBe("https://put.example/obj");
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
    });
  });

  it("spreads Azure uploadHeaders (x-ms-blob-type) onto the PUT", async () => {
    const onAttachMedia = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: "https://acct.blob.core.windows.net/cont/obj?sas",
          objectKey: "media/u/obj.jpg",
          uploadHeaders: {
            "content-type": "image/jpeg",
            "x-ms-blob-type": "BlockBlob",
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onAttachMedia={onAttachMedia}
        readDimensions={readDimensions}
      />,
    );

    fireEvent.change(screen.getByTestId("today-photo-input"), {
      target: { files: [fakeFile("photo.jpg", "image/jpeg")] },
    });

    await waitFor(() =>
      expect(onAttachMedia).toHaveBeenCalledWith("media/u/obj.jpg", 640, 480),
    );
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({
      method: "PUT",
      headers: {
        "content-type": "image/jpeg",
        "x-ms-blob-type": "BlockBlob",
      },
    });
  });

  it("rejects a non-image file with an error and never uploads", async () => {
    const onAttachMedia = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onAttachMedia={onAttachMedia}
        readDimensions={readDimensions}
      />,
    );

    fireEvent.change(screen.getByTestId("today-photo-input"), {
      target: { files: [fakeFile("clip.mp4", "video/mp4")] },
    });

    expect(await screen.findByTestId("today-photo-error")).toHaveTextContent(/png, jpeg, and webp/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAttachMedia).not.toHaveBeenCalled();
  });

  it("shows an error and does not attach when the presign request fails", async () => {
    const onAttachMedia = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }));

    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onAttachMedia={onAttachMedia}
        readDimensions={readDimensions}
      />,
    );

    fireEvent.change(screen.getByTestId("today-photo-input"), {
      target: { files: [fakeFile("p.png", "image/png")] },
    });

    expect(await screen.findByTestId("today-photo-error")).toHaveTextContent(/upload url/i);
    expect(onAttachMedia).not.toHaveBeenCalled();
  });

  it("shows an error and does not attach when the PUT upload fails", async () => {
    const onAttachMedia = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ uploadUrl: "https://put/obj", objectKey: "k" }),
        })
        .mockResolvedValueOnce({ ok: false }),
    );

    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onAttachMedia={onAttachMedia}
        readDimensions={readDimensions}
      />,
    );

    fireEvent.change(screen.getByTestId("today-photo-input"), {
      target: { files: [fakeFile("p.webp", "image/webp")] },
    });

    expect(await screen.findByTestId("today-photo-error")).toHaveTextContent(/upload failed/i);
    expect(onAttachMedia).not.toHaveBeenCalled();
  });

  it("shows an error when reading the image dimensions throws", async () => {
    const onAttachMedia = vi.fn();
    vi.stubGlobal("fetch", vi.fn());

    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onAttachMedia={onAttachMedia}
        readDimensions={() => Promise.reject(new Error("bad image"))}
      />,
    );

    fireEvent.change(screen.getByTestId("today-photo-input"), {
      target: { files: [fakeFile("p.jpg", "image/jpeg")] },
    });

    expect(await screen.findByTestId("today-photo-error")).toHaveTextContent(/upload failed/i);
    expect(onAttachMedia).not.toHaveBeenCalled();
  });

  it("ignores a change event with no file selected", () => {
    const onAttachMedia = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onAttachMedia={onAttachMedia}
        readDimensions={readDimensions}
      />,
    );

    fireEvent.change(screen.getByTestId("today-photo-input"), { target: { files: [] } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAttachMedia).not.toHaveBeenCalled();
  });

  it("renders the journal editor, prefilled, and Save threads through onSaveJournal", async () => {
    const onSaveJournal = vi.fn().mockResolvedValue(undefined);
    const state = activeStateWithMedia([]);
    state.today!.journal = { wins: "ran 5k", lessons: "earlier" };
    render(
      <Project50View
        state={state}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onSaveJournal={onSaveJournal}
      />,
    );
    // prefilled from today.journal
    expect((screen.getByLabelText(/today's wins/i) as HTMLTextAreaElement).value).toBe("ran 5k");
    fireEvent.click(screen.getByTestId("journal-save"));
    // today.dayKey is threaded through so the server files under the visible day.
    expect(onSaveJournal).toHaveBeenCalledWith("ran 5k", "earlier", "2026-06-02");
    // confirmation only after the (resolved) save
    expect(await screen.findByTestId("journal-saved")).toBeInTheDocument();
  });

  it("Save is a no-op that still confirms when onSaveJournal is not provided", async () => {
    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("journal-save"));
    expect(await screen.findByTestId("journal-saved")).toBeInTheDocument();
  });

  it("renders an accessible remove button per photo and calls onRemoveMedia(id) after confirm", () => {
    const onRemoveMedia = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <Project50View
        state={activeStateWithMedia([
          { id: "m1", objectKey: "k1", width: 10, height: 10, url: "https://cdn/k1" },
          { id: "m2", objectKey: "k2", width: 20, height: 20, url: "https://cdn/k2" },
        ])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onRemoveMedia={onRemoveMedia}
      />,
    );
    const removeButtons = screen.getAllByTestId("today-photo-remove");
    expect(removeButtons).toHaveLength(2);
    // accessible, keyboard-focusable labels per photo
    expect(removeButtons[0]).toHaveAttribute("aria-label", "Remove photo 1");
    expect(removeButtons[1]).toHaveAttribute("aria-label", "Remove photo 2");

    fireEvent.click(removeButtons[0]!);
    expect(confirmSpy).toHaveBeenCalled();
    expect(onRemoveMedia).toHaveBeenCalledWith("m1");
  });

  it("does NOT call onRemoveMedia when the confirm is cancelled", () => {
    const onRemoveMedia = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <Project50View
        state={activeStateWithMedia([
          { id: "m1", objectKey: "k1", width: 10, height: 10, url: "https://cdn/k1" },
        ])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onRemoveMedia={onRemoveMedia}
      />,
    );
    fireEvent.click(screen.getByTestId("today-photo-remove"));
    expect(onRemoveMedia).not.toHaveBeenCalled();
  });

  it("disables the remove button and shows a pending state while a removal is in flight", () => {
    const onRemoveMedia = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <Project50View
        state={activeStateWithMedia([
          { id: "m1", objectKey: "k1", width: 10, height: 10, url: "https://cdn/k1" },
          { id: "m2", objectKey: "k2", width: 20, height: 20, url: "https://cdn/k2" },
        ])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        onRemoveMedia={onRemoveMedia}
      />,
    );
    const buttons = screen.getAllByTestId("today-photo-remove");
    fireEvent.click(buttons[0]!);
    // the clicked photo's remove button becomes disabled (pending)
    expect(buttons[0]).toBeDisabled();
    // a second click on the same pending button does not re-fire the callback
    fireEvent.click(buttons[0]!);
    expect(onRemoveMedia).toHaveBeenCalledTimes(1);
  });

  it("renders thumbnails with no remove button when onRemoveMedia is not provided", () => {
    render(
      <Project50View
        state={activeStateWithMedia([
          { id: "m1", objectKey: "k1", width: 10, height: 10, url: "https://cdn/k1" },
        ])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
      />,
    );
    expect(screen.getByTestId("today-photo-thumb")).toBeInTheDocument();
    expect(screen.queryByTestId("today-photo-remove")).not.toBeInTheDocument();
  });

  it("uploads successfully even when onAttachMedia is not provided (optional callback)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadUrl: "https://put/obj", objectKey: "k" }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Project50View
        state={activeStateWithMedia([])}
        onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()}
        readDimensions={readDimensions}
      />,
    );

    fireEvent.change(screen.getByTestId("today-photo-input"), {
      target: { files: [fakeFile("p.jpg", "image/jpeg")] },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // No error surfaced — the optional callback was simply skipped.
    expect(screen.queryByTestId("today-photo-error")).not.toBeInTheDocument();
  });
});
