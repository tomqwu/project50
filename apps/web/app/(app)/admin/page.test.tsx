import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

const { mockRequireUser, mockRequireAdmin, mockListUsers, mockListReports, mockNotFound } =
  vi.hoisted(() => ({
    mockRequireUser: vi.fn<() => Promise<string>>(),
    mockRequireAdmin: vi.fn(),
    mockListUsers: vi.fn(),
    mockListReports: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/admin", () => ({
  requireAdmin: mockRequireAdmin,
  listUsers: mockListUsers,
  listReports: mockListReports,
}));
vi.mock("next/navigation", () => ({ notFound: mockNotFound }));

import AdminPage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("AdminPage", () => {
  it("admin → renders the AdminView with users and reports", async () => {
    mockRequireUser.mockResolvedValue("admin1");
    mockRequireAdmin.mockResolvedValue({ id: "admin1", isAdmin: true });
    mockListUsers.mockResolvedValue([
      { id: "u1", handle: "alice", displayName: "Alice", isAdmin: false },
    ]);
    mockListReports.mockResolvedValue([
      {
        id: "r1",
        reporterId: "u1",
        reporterHandle: "alice",
        targetType: "USER",
        targetId: "u2",
        reason: "spam",
        createdAt: new Date("2026-06-01T00:00:00Z"),
      },
    ]);

    const ui = await AdminPage();
    render(ui);

    expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument();
    const userRow = screen.getByTestId("user-row-u1");
    expect(within(userRow).getByText("@alice")).toBeInTheDocument();
    expect(within(userRow).getByText("Alice")).toBeInTheDocument();
    const reportRow = screen.getByTestId("report-row-r1");
    expect(within(reportRow).getByText("spam")).toBeInTheDocument();
    expect(mockRequireAdmin).toHaveBeenCalledWith("admin1");
  });

  it("non-admin → calls notFound() and does not render", async () => {
    mockNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockRequireUser.mockResolvedValue("user1");
    mockRequireAdmin.mockRejectedValue(
      Object.assign(new Error("ADMIN_FORBIDDEN"), {
        status: 404,
        code: "ADMIN_FORBIDDEN",
      }),
    );

    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockListUsers).not.toHaveBeenCalled();
  });
});
