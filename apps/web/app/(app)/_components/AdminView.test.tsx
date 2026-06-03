import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { AdminView } from "./AdminView";
import type { AdminUser, AdminReport } from "@/lib/api/admin";

afterEach(() => {
  cleanup();
});

const users: AdminUser[] = [
  { id: "u1", handle: "alice", displayName: "Alice", isAdmin: false },
  { id: "u2", handle: "boss", displayName: "Boss", isAdmin: true },
];

const reports: AdminReport[] = [
  {
    id: "r1",
    reporterId: "u1",
    reporterHandle: "alice",
    targetType: "ACTIVITY",
    targetId: "act-9",
    reason: "spam",
    createdAt: new Date("2026-06-01T00:00:00Z"),
  },
];

describe("AdminView", () => {
  it("renders the users table with handle, display name, and role", () => {
    render(<AdminView users={users} reports={reports} />);

    expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument();
    expect(screen.getByText("Users (2)")).toBeInTheDocument();

    const aliceRow = screen.getByTestId("user-row-u1");
    expect(within(aliceRow).getByText("@alice")).toBeInTheDocument();
    expect(within(aliceRow).getByText("Alice")).toBeInTheDocument();
    expect(within(aliceRow).getByText("Member")).toBeInTheDocument();

    const bossRow = screen.getByTestId("user-row-u2");
    expect(within(bossRow).getByText("Admin")).toBeInTheDocument();
  });

  it("renders the reports table with target, reason, and reporter", () => {
    render(<AdminView users={users} reports={reports} />);

    expect(screen.getByText("Reports (1)")).toBeInTheDocument();
    const row = screen.getByTestId("report-row-r1");
    expect(within(row).getByText(/ACTIVITY · act-9/)).toBeInTheDocument();
    expect(within(row).getByText("spam")).toBeInTheDocument();
    expect(within(row).getByText("@alice")).toBeInTheDocument();
  });

  it("renders empty states when there are no users or reports", () => {
    render(<AdminView users={[]} reports={[]} />);

    expect(screen.getByText("No users.")).toBeInTheDocument();
    expect(screen.getByText("No reports to review.")).toBeInTheDocument();
    expect(screen.getByText("Users (0)")).toBeInTheDocument();
    expect(screen.getByText("Reports (0)")).toBeInTheDocument();
  });
});
