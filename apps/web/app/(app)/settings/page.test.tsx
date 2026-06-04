import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockRequireUser, mockGetAccount, mockGetNotificationPrefs } =
  vi.hoisted(() => ({
    mockRequireUser: vi.fn<() => Promise<string>>(),
    mockGetAccount: vi.fn(),
    mockGetNotificationPrefs: vi.fn(),
  }));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/account", () => ({ getAccount: mockGetAccount }));
vi.mock("@/lib/api/notification-prefs", () => ({
  getNotificationPrefs: mockGetNotificationPrefs,
}));
vi.mock("./_components/AccountSettingsForm", () => ({
  AccountSettingsForm: ({
    initial,
  }: {
    initial: { handle: string; displayName: string };
  }) => <div data-testid="account-form">{initial.handle}</div>,
}));
vi.mock("./_components/NotificationPrefsSection", () => ({
  NotificationPrefsSection: ({
    initial,
  }: {
    initial: { remindersEnabled: boolean };
  }) => (
    <div data-testid="notification-prefs-section">
      {String(initial.remindersEnabled)}
    </div>
  ),
}));
vi.mock("./_components/DeleteAccountSection", () => ({
  DeleteAccountSection: ({ handle }: { handle: string }) => (
    <div data-testid="delete-section">{handle}</div>
  ),
}));
vi.mock("./_components/BillingSection", () => ({
  BillingSection: () => <div data-testid="billing-section" />,
}));
vi.mock("./_components/DataExportSection", () => ({
  DataExportSection: () => <div data-testid="export-section" />,
}));

import SettingsPage from "./page";

beforeEach(() => {
  mockRequireUser.mockResolvedValue("u1");
  mockGetAccount.mockResolvedValue({ handle: "alice", displayName: "Alice A" });
  mockGetNotificationPrefs.mockResolvedValue({
    remindersEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
  });
});

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

  it("renders the billing entry-point section", async () => {
    mockRequireUser.mockResolvedValue("u1");
    mockGetAccount.mockResolvedValue({ handle: "alice", displayName: "Alice A" });

    const ui = await SettingsPage();
    render(ui);

    expect(screen.getByTestId("billing-section")).toBeInTheDocument();
  });

  it("renders the data export section", async () => {
    const ui = await SettingsPage();
    render(ui);

    expect(screen.getByTestId("export-section")).toBeInTheDocument();
  });

  it("loads notification prefs and renders the notifications section", async () => {
    mockGetNotificationPrefs.mockResolvedValue({
      remindersEnabled: false,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    });

    const ui = await SettingsPage();
    render(ui);

    expect(mockGetNotificationPrefs).toHaveBeenCalledWith("u1");
    expect(screen.getByTestId("notification-prefs-section")).toHaveTextContent(
      "false",
    );
  });
});
