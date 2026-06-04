import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockRequireUser, mockGetAccount } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockGetAccount: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/account", () => ({ getAccount: mockGetAccount }));
vi.mock("./_components/AccountSettingsForm", () => ({
  AccountSettingsForm: ({
    initial,
  }: {
    initial: { handle: string; displayName: string };
  }) => <div data-testid="account-form">{initial.handle}</div>,
}));
vi.mock("./_components/DeleteAccountSection", () => ({
  DeleteAccountSection: ({ handle }: { handle: string }) => (
    <div data-testid="delete-section">{handle}</div>
  ),
}));
vi.mock("./_components/DataExportSection", () => ({
  DataExportSection: () => <div data-testid="export-section" />,
}));

import SettingsPage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("SettingsPage", () => {
  it("requires auth, loads the account, and renders the form with initial data", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetAccount.mockResolvedValue({ handle: "alice", displayName: "Alice A" });

    const ui = await SettingsPage();
    render(ui);

    expect(mockRequireUser).toHaveBeenCalled();
    expect(mockGetAccount).toHaveBeenCalledWith("u1");
    expect(screen.getByTestId("account-form")).toHaveTextContent("alice");
  });

  it("renders the danger-zone delete section with the user's handle", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetAccount.mockResolvedValue({ handle: "alice", displayName: "Alice A" });

    const ui = await SettingsPage();
    render(ui);

    expect(screen.getByTestId("delete-section")).toHaveTextContent("alice");
  });

  it("renders the data export section", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetAccount.mockResolvedValue({ handle: "alice", displayName: "Alice A" });

    const ui = await SettingsPage();
    render(ui);

    expect(screen.getByTestId("export-section")).toBeInTheDocument();
  });
});
