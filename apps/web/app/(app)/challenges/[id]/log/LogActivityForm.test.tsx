import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { mockPush, mockFetch } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Override global fetch
globalThis.fetch = mockFetch;

// Mock URL.createObjectURL and URL.revokeObjectURL (jsdom doesn't implement them)
const mockObjectUrl = "blob:http://localhost/fake-object-url";
Object.defineProperty(URL, "createObjectURL", {
  value: vi.fn(() => mockObjectUrl),
  writable: true,
});
Object.defineProperty(URL, "revokeObjectURL", {
  value: vi.fn(),
  writable: true,
});

import { LogActivityForm, readImageDimensions } from "./LogActivityForm";
import { localDayKey } from "@project50/core";

beforeEach(() => {
  mockReadDimensions.mockResolvedValue({ width: 800, height: 600 });
  // vi.resetAllMocks() in afterEach clears these implementations; re-establish them
  // so createObjectURL returns a truthy preview URL for every test.
  (URL.createObjectURL as ReturnType<typeof vi.fn>).mockReturnValue(mockObjectUrl);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

// A mock readDimensions that returns fixed dimensions without touching Image/DOM.
// Re-implement after each reset because vi.resetAllMocks() clears mockResolvedValue.
const mockReadDimensions = vi.fn();

// Helper to create a fake File for upload tests
function makeImageFile(name = "photo.jpg", type = "image/jpeg") {
  return new File(["fake-image-bytes"], name, { type });
}

describe("LogActivityForm — TARGET", () => {
  it("renders amount input and activity type chips", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    expect(screen.getByTestId("amount-input")).toBeInTheDocument();
    expect(screen.getByTestId("chip-run")).toBeInTheDocument();
    expect(screen.getByTestId("chip-bike")).toBeInTheDocument();
    expect(screen.getByTestId("chip-gym")).toBeInTheDocument();
    expect(screen.getByTestId("chip-yoga")).toBeInTheDocument();
  });

  it("does not render done toggle for TARGET", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    expect(screen.queryByTestId("done-toggle")).toBeNull();
  });

  it("shows unit in label when unit provided", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    expect(screen.getByText("Amount (km)")).toBeInTheDocument();
  });

  it("shows 'Amount' without unit when unit is null", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit={null} />);
    expect(screen.getByText("Amount")).toBeInTheDocument();
  });

  it("controls amount input", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    const input = screen.getByTestId("amount-input");
    fireEvent.change(input, { target: { value: "5.5" } });
    expect(input).toHaveValue(5.5);
  });

  it("submits correct JSON body and redirects on 201", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);

    // Select Run chip
    fireEvent.click(screen.getByTestId("chip-run"));
    // Set amount
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "5" } });
    // Set note
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "Great run" } });
    // Set mood 4
    fireEvent.click(screen.getByTestId("mood-4"));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/c1/activities",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const firstCall = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(firstCall[1].body);
    expect(body.activityType).toBe("Run");
    expect(body.amount).toBe(5);
    expect(body.note).toBe("Great run");
    expect(body.mood).toBe(4);
    expect(body.dayKey).toMatch(/\d{4}-\d{2}-\d{2}/);
    // No media when no photo selected
    expect(body.media).toBeUndefined();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("shows 422 errors inline", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        code: "INVALID_ACTIVITY",
        detail: ["dayKey out of range", "amount required"],
      }),
    });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-errors")).toBeInTheDocument();
      expect(screen.getByText("dayKey out of range")).toBeInTheDocument();
      expect(screen.getByText("amount required")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows generic error on non-422 failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });

  it("shows network error on fetch exception", async () => {
    mockFetch.mockRejectedValue(new Error("network fail"));

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it("toggles activity type chip deselect", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    const chip = screen.getByTestId("chip-run");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip); // deselect
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles mood button deselect", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    const mood = screen.getByTestId("mood-3");
    fireEvent.click(mood);
    expect(mood).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(mood); // deselect
    expect(mood).toHaveAttribute("aria-pressed", "false");
  });

  it("sends 422 string detail as array", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "single string error" }),
    });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText("single string error")).toBeInTheDocument();
    });
  });

  it("sends 422 with code when no detail", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ code: "SOME_CODE" }),
    });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText("SOME_CODE")).toBeInTheDocument();
    });
  });

  it("shows fallback 'Validation error' when 422 body has no detail and no code", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
    });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText("Validation error")).toBeInTheDocument();
    });
  });
});

describe("LogActivityForm — BINARY", () => {
  it("renders done toggle and no amount input", () => {
    render(<LogActivityForm challengeId="c1" goalType="BINARY" />);
    expect(screen.getByTestId("done-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("amount-input")).toBeNull();
  });

  it("controls done toggle", () => {
    render(<LogActivityForm challengeId="c1" goalType="BINARY" />);
    const toggle = screen.getByTestId("done-toggle");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("submits done=true and redirects on 201", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    render(<LogActivityForm challengeId="c1" goalType="BINARY" />);
    fireEvent.click(screen.getByTestId("done-toggle"));
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      const binaryCall = mockFetch.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(binaryCall[1].body);
      expect(body.done).toBe(true);
      expect(body.amount).toBeUndefined();
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});

describe("LogActivityForm — timezone", () => {
  it("derives the dayKey in the challenge timezone, not the browser zone", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    const before = new Date();
    render(<LogActivityForm challengeId="c1" goalType="BINARY" timezone="Asia/Shanghai" />);
    fireEvent.click(screen.getByTestId("done-toggle"));
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const after = new Date();

    const call = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    // The submitted dayKey must be "today" in the CHALLENGE zone (Asia/Shanghai),
    // not the runner's zone. Bound by the wall-clock window around the click so a
    // midnight tick can't make this flaky.
    const expected = new Set([
      localDayKey(before, "Asia/Shanghai"),
      localDayKey(after, "Asia/Shanghai"),
    ]);
    expect(expected.has(body.dayKey)).toBe(true);
  });

  // The server validates `asOf` with `challenge.timezone ?? "UTC"`, so for a
  // null/blank challenge timezone the form MUST also use UTC (not the browser
  // zone) or a valid submission is rejected as DAY_IN_FUTURE near midnight.
  it.each([
    ["null", null as string | null],
    ["blank", "" as string | null],
  ])("uses UTC (matching the server) when the challenge timezone is %s", async (_label, tz) => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    const before = new Date();
    render(<LogActivityForm challengeId="c1" goalType="BINARY" timezone={tz} />);
    fireEvent.click(screen.getByTestId("done-toggle"));
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const after = new Date();

    const call = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    // Identical to the server's localDayKey(now, "UTC"); window-bounded so a
    // midnight tick can't make this flaky.
    const expected = new Set([localDayKey(before, "UTC"), localDayKey(after, "UTC")]);
    expect(expected.has(body.dayKey)).toBe(true);
  });
});

describe("LogActivityForm — Photo upload", () => {
  it("renders the photo file input", () => {
    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );
    expect(screen.getByTestId("photo-input")).toBeInTheDocument();
  });

  it("presigns, PUTs, and shows thumbnail after selecting a file", async () => {
    mockFetch
      .mockResolvedValueOnce({
        // presign response
        ok: true,
        json: async () => ({
          uploadUrl: "https://minio/bucket/key?sig=x",
          objectKey: "media/u1/photo_jpg.jpg",
        }),
      })
      .mockResolvedValueOnce({
        // PUT response
        ok: true,
      });

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    const file = makeImageFile("my run.jpg", "image/jpeg");
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Should show thumbnail
    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeInTheDocument();
    });

    // presign called with correct content type + sanitized suffix
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/uploads/presign",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("image/jpeg"),
      }),
    );

    // PUT called with upload URL
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://minio/bucket/key?sig=x",
      expect.objectContaining({
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
      }),
    );

    // readDimensions was called with the file
    expect(mockReadDimensions).toHaveBeenCalledWith(file);
  });

  it("includes media in submit body after successful upload", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadUrl: "https://minio/up", objectKey: "media/u1/photo_jpg.jpg" }),
      })
      .mockResolvedValueOnce({ ok: true }) // PUT
      .mockResolvedValueOnce({ ok: true, status: 201 }); // POST activity

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } });

    // Wait for upload to complete
    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeInTheDocument();
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });

    // The third fetch call is the activity POST
    const activityCall = mockFetch.mock.calls[2] as [string, { body: string }];
    const body = JSON.parse(activityCall[1].body);
    expect(body.media).toEqual([{ objectKey: "media/u1/photo_jpg.jpg", width: 800, height: 600 }]);
  });

  it("shows upload error and no thumbnail when presign fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 });

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("photo-preview")).toBeNull();
  });

  it("shows upload error and no thumbnail when PUT fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadUrl: "https://minio/up", objectKey: "media/u1/photo_jpg.jpg" }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 }); // PUT fails

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("photo-preview")).toBeNull();
  });

  it("shows upload error when readDimensions throws", async () => {
    const failDimensions = vi.fn().mockRejectedValue(new Error("cannot load"));

    render(<LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={failDimensions} />);

    const fileInput = screen.getByTestId("photo-input");
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("photo-preview")).toBeNull();
  });

  it("allows text-only submit even after presign failure", async () => {
    // presign fails
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 422 })
      // activity submit succeeds
      .mockResolvedValueOnce({ ok: true, status: 201 });

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    // Trigger upload failure
    const fileInput = screen.getByTestId("photo-input");
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
    });

    // Submit text-only (no media selected)
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });

    // Check that media is NOT in the submit body
    const activityCall = mockFetch.mock.calls[1] as [string, { body: string }];
    const body = JSON.parse(activityCall[1].body);
    expect(body.media).toBeUndefined();
  });

  it("allows text-only submit after PUT failure", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadUrl: "https://minio/up", objectKey: "media/u1/photo_jpg.jpg" }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 }) // PUT fails
      .mockResolvedValueOnce({ ok: true, status: 201 }); // activity submit

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });

    const activityCall = mockFetch.mock.calls[2] as [string, { body: string }];
    const body = JSON.parse(activityCall[1].body);
    expect(body.media).toBeUndefined();
  });

  it("removes photo when remove button is clicked and clears upload error", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadUrl: "https://minio/up", objectKey: "media/u1/photo_jpg.jpg" }),
      })
      .mockResolvedValueOnce({ ok: true }); // PUT

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeInTheDocument();
    });

    // Click remove
    fireEvent.click(screen.getByTestId("remove-photo-btn"));

    expect(screen.queryByTestId("photo-preview")).toBeNull();
    expect(screen.queryByTestId("remove-photo-btn")).toBeNull();
    expect(screen.getByTestId("photo-input")).toBeInTheDocument();
  });

  it("suffix in presign body is sanitized from filename", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: "https://minio/up",
          objectKey: "media/u1/my_run_photo_jpg.jpg",
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    fireEvent.change(fileInput, { target: { files: [makeImageFile("my run photo.jpg")] } });

    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeInTheDocument();
    });

    const presignCall = mockFetch.mock.calls[0] as [string, { body: string }];
    const presignBody = JSON.parse(presignCall[1].body) as { suffix: string };
    // The suffix should have spaces replaced by underscores
    expect(presignBody.suffix).toBe("my_run_photo");
  });

  it("shows upload error for unsupported file type", async () => {
    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    const gifFile = new File(["gif"], "anim.gif", { type: "image/gif" });
    fireEvent.change(fileInput, { target: { files: [gifFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
    });
    // No fetch calls made
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("submit without photo does not include media key", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });

    const call = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    expect(body.media).toBeUndefined();
  });

  it("does nothing when the change event has no file selected", async () => {
    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    // Fire change with an empty file list → handler should early-return.
    fireEvent.change(fileInput, { target: { files: [] } });

    // No upload error, no preview, no fetch, no dimension read.
    expect(screen.queryByTestId("upload-error")).toBeNull();
    expect(screen.queryByTestId("photo-preview")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockReadDimensions).not.toHaveBeenCalled();
  });

  it("falls back to 'upload' suffix when filename sanitizes to empty", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadUrl: "https://minio/up", objectKey: "media/u1/upload.png" }),
      })
      .mockResolvedValueOnce({ ok: true }); // PUT

    render(
      <LogActivityForm challengeId="c1" goalType="TARGET" readDimensions={mockReadDimensions} />,
    );

    const fileInput = screen.getByTestId("photo-input");
    // Filename whose stem is empty after stripping the extension → "" → "upload".
    const file = new File(["bytes"], ".png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeInTheDocument();
    });

    const presignCall = mockFetch.mock.calls[0] as [string, { body: string }];
    const presignBody = JSON.parse(presignCall[1].body) as { suffix: string };
    expect(presignBody.suffix).toBe("upload");
  });
});

describe("readImageDimensions", () => {
  // Save/restore the real globals around these tests.
  const RealImage = globalThis.Image;

  afterEach(() => {
    globalThis.Image = RealImage;
    vi.resetAllMocks();
    (URL.createObjectURL as ReturnType<typeof vi.fn>).mockReturnValue(mockObjectUrl);
    (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mockReset();
  });

  it("resolves with naturalWidth/naturalHeight on image load and revokes the object URL", async () => {
    let loadHandler: (() => void) | null = null;
    // Minimal fake Image: capture onload, expose natural dimensions.
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_value: string) {
        this.naturalWidth = 320;
        this.naturalHeight = 240;
        // Stash the handler so the test can fire it after src assignment.
        loadHandler = () => this.onload?.();
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image;

    const file = new File(["bytes"], "p.png", { type: "image/png" });
    const promise = readImageDimensions(file);

    // Trigger onload.
    loadHandler!();

    const dims = await promise;
    expect(dims).toEqual({ width: 320, height: 240 });
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectUrl);
  });

  it("rejects and revokes the object URL when the image fails to load", async () => {
    let errorHandler: (() => void) | null = null;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_value: string) {
        errorHandler = () => this.onerror?.();
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image;

    const file = new File(["bytes"], "p.png", { type: "image/png" });
    const promise = readImageDimensions(file);

    // Trigger onerror.
    errorHandler!();

    await expect(promise).rejects.toThrow("Failed to load image");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectUrl);
  });
});
