import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

const { mockQueryRaw, mockCheckStorage } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockCheckStorage: vi.fn(),
}));
vi.mock("@project50/db", () => ({ prisma: { $queryRaw: mockQueryRaw } }));
vi.mock("@/lib/storage", () => ({ checkStorage: mockCheckStorage }));

import StatusPage, { dynamic } from "./page";

function rowFor(name: string): HTMLElement {
  const rows = screen.getAllByTestId("component-row");
  const row = rows.find((r) => within(r).queryByText(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-04T12:00:00.000Z"));
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("status page route", () => {
  it("opts out of caching (dynamic)", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("StatusPage integration", () => {
  it("renders Operational when database and storage are both reachable", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockCheckStorage.mockResolvedValue(true);

    render(await StatusPage());

    const banner = screen.getByTestId("overall-status");
    expect(banner).toHaveAttribute("data-status", "operational");
    expect(rowFor("Web")).toHaveAttribute("data-status", "operational");
    expect(rowFor("Database")).toHaveAttribute("data-status", "operational");
    expect(rowFor("Object storage")).toHaveAttribute(
      "data-status",
      "operational",
    );
  });

  it("renders Degraded when storage is down but the database is up", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockCheckStorage.mockResolvedValue(false);

    render(await StatusPage());

    expect(screen.getByTestId("overall-status")).toHaveAttribute(
      "data-status",
      "degraded",
    );
    expect(rowFor("Object storage")).toHaveAttribute("data-status", "down");
    expect(rowFor("Database")).toHaveAttribute("data-status", "operational");
  });

  it("renders Degraded when the database query throws but storage is up", async () => {
    mockQueryRaw.mockRejectedValue(new Error("db down"));
    mockCheckStorage.mockResolvedValue(true);

    render(await StatusPage());

    expect(screen.getByTestId("overall-status")).toHaveAttribute(
      "data-status",
      "degraded",
    );
    expect(rowFor("Database")).toHaveAttribute("data-status", "down");
  });

  it("renders Down when both the database and storage are unreachable", async () => {
    mockQueryRaw.mockRejectedValue(new Error("db down"));
    mockCheckStorage.mockResolvedValue(false);

    render(await StatusPage());

    expect(screen.getByTestId("overall-status")).toHaveAttribute(
      "data-status",
      "down",
    );
    expect(rowFor("Database")).toHaveAttribute("data-status", "down");
    expect(rowFor("Object storage")).toHaveAttribute("data-status", "down");
  });

  it("stamps each component with the render-time checkedAt timestamp", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockCheckStorage.mockResolvedValue(true);

    render(await StatusPage());

    const times = screen.getAllByText((_, el) => el?.tagName === "TIME");
    for (const t of times) {
      expect(t).toHaveAttribute("dateTime", "2026-06-04T12:00:00.000Z");
    }
  });

  it("issues a trivial SELECT 1 to probe the database", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockCheckStorage.mockResolvedValue(true);

    render(await StatusPage());

    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });
});
