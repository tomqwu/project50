import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockGetPublicDay, mockNotFound } = vi.hoisted(() => ({
  mockGetPublicDay: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/api/day-share", () => ({
  getPublicDay: mockGetPublicDay,
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    style,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
    [key: string]: unknown;
  }) => (
    <a href={href} style={style} {...rest}>
      {children}
    </a>
  ),
}));

import DaySharePage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

beforeEach(() => {
  // resetAllMocks() wipes the throwing implementation; restore it so notFound()
  // short-circuits the RSC the way Next's does.
  mockNotFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

const baseDay = {
  challenge: { title: "Project 50", lengthDays: 50, shareId: "share-abc" },
  dayNumber: 7,
  dayKey: "2026-06-07",
  rulesCompleted: 7,
  ruleChecks: [true, true, true, true, true, true, true],
  media: [{ url: "https://signed/a" }],
  journal: { wins: "ran a 10k", lessons: "fuel earlier" },
};

const params = (shareId: string, day: string) => Promise.resolve({ shareId, day });

describe("DaySharePage", () => {
  it("calls notFound when the day is null (private / out of range)", async () => {
    mockGetPublicDay.mockResolvedValue(null);
    await expect(DaySharePage({ params: params("x", "99") })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("parses the day param to a number and passes it to getPublicDay", async () => {
    mockGetPublicDay.mockResolvedValue(baseDay);
    render(await DaySharePage({ params: params("share-abc", "7") }));
    expect(mockGetPublicDay).toHaveBeenCalledWith("share-abc", 7);
  });

  it("calls notFound for a non-numeric day param without hitting the loader", async () => {
    await expect(DaySharePage({ params: params("share-abc", "abc") })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockGetPublicDay).not.toHaveBeenCalled();
  });

  it("renders the Day N / 50 heading", async () => {
    mockGetPublicDay.mockResolvedValue(baseDay);
    render(await DaySharePage({ params: params("share-abc", "7") }));
    expect(screen.getByText("Day 7 / 50")).toBeInTheDocument();
  });

  it("renders all 7 rule rows with a check for done rules", async () => {
    mockGetPublicDay.mockResolvedValue({
      ...baseDay,
      rulesCompleted: 2,
      ruleChecks: [true, false, true, false, false, false, false],
    });
    render(await DaySharePage({ params: params("share-abc", "7") }));
    const rows = screen.getAllByTestId(/^rule-row-/);
    expect(rows).toHaveLength(7);
    expect(screen.getByTestId("rule-row-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("rule-row-2")).toHaveAttribute("data-done", "false");
    expect(screen.getByTestId("rule-row-3")).toHaveAttribute("data-done", "true");
  });

  it("renders the rules-completed count", async () => {
    mockGetPublicDay.mockResolvedValue(baseDay);
    render(await DaySharePage({ params: params("share-abc", "7") }));
    expect(screen.getByText("7 / 7")).toBeInTheDocument();
  });

  it("renders each attached photo", async () => {
    mockGetPublicDay.mockResolvedValue({
      ...baseDay,
      media: [{ url: "https://signed/a" }, { url: "https://signed/b" }],
    });
    render(await DaySharePage({ params: params("share-abc", "7") }));
    const photos = screen.getAllByTestId(/^day-photo-/);
    expect(photos).toHaveLength(2);
    expect(photos[0]).toHaveAttribute("src", "https://signed/a");
  });

  it("renders no photo section when there are no photos", async () => {
    mockGetPublicDay.mockResolvedValue({ ...baseDay, media: [] });
    render(await DaySharePage({ params: params("share-abc", "7") }));
    expect(screen.queryByTestId(/^day-photo-/)).not.toBeInTheDocument();
  });

  it("renders the journal wins and lessons when present", async () => {
    mockGetPublicDay.mockResolvedValue(baseDay);
    render(await DaySharePage({ params: params("share-abc", "7") }));
    expect(screen.getByText("ran a 10k")).toBeInTheDocument();
    expect(screen.getByText("fuel earlier")).toBeInTheDocument();
  });

  it("omits the journal section when there is no journal", async () => {
    const { journal: _omit, ...noJournal } = baseDay;
    mockGetPublicDay.mockResolvedValue(noJournal);
    render(await DaySharePage({ params: params("share-abc", "7") }));
    expect(screen.queryByTestId("day-journal")).not.toBeInTheDocument();
  });

  it("renders the wordmark and the 'Start your own' link to /signin", async () => {
    mockGetPublicDay.mockResolvedValue(baseDay);
    render(await DaySharePage({ params: params("share-abc", "7") }));
    expect(screen.getByTestId("wordmark")).toHaveTextContent("project50");
    const link = screen.getByTestId("start-own-link");
    expect(link).toHaveAttribute("href", "/signin");
  });
});
