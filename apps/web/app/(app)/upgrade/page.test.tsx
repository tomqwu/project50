import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Entitlement } from "@/lib/api/entitlements";

const { mockRequireUser, mockGetEntitlement, mockIsBillingConfigured } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockGetEntitlement: vi.fn(),
  mockIsBillingConfigured: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/api/entitlements", () => ({ getEntitlement: mockGetEntitlement }));
vi.mock("@/lib/api/billing", () => ({ isBillingConfigured: mockIsBillingConfigured }));
vi.mock("./_components/Paywall", () => ({
  Paywall: (props: {
    entitlement: Entitlement;
    billingConfigured: boolean;
    trialPeriodDays?: number;
  }) => (
    <div
      data-testid="paywall-stub"
      data-plan={props.entitlement.plan}
      data-configured={String(props.billingConfigured)}
      data-trial={String(props.trialPeriodDays)}
    />
  ),
}));

import UpgradePage from "./page";

const ORIGINAL_ENV = { ...process.env };

const freeEntitlement: Entitlement = {
  plan: "free",
  isPremium: false,
  status: "NONE",
  currentPeriodEnd: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireUser.mockResolvedValue("u1");
  mockGetEntitlement.mockResolvedValue(freeEntitlement);
  mockIsBillingConfigured.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  process.env = { ...ORIGINAL_ENV };
});

describe("UpgradePage", () => {
  it("requires auth, resolves the entitlement, and passes it to the Paywall", async () => {
    render(await UpgradePage());
    expect(mockRequireUser).toHaveBeenCalled();
    expect(mockGetEntitlement).toHaveBeenCalledWith("u1");
    const stub = screen.getByTestId("paywall-stub");
    expect(stub).toHaveAttribute("data-plan", "free");
    expect(stub).toHaveAttribute("data-configured", "true");
  });

  it("reflects billing being unconfigured", async () => {
    mockIsBillingConfigured.mockReturnValue(false);
    render(await UpgradePage());
    expect(screen.getByTestId("paywall-stub")).toHaveAttribute("data-configured", "false");
  });

  it("passes a positive STRIPE_TRIAL_DAYS through as trialPeriodDays", async () => {
    process.env.STRIPE_TRIAL_DAYS = "7";
    render(await UpgradePage());
    expect(screen.getByTestId("paywall-stub")).toHaveAttribute("data-trial", "7");
  });

  it("ignores a non-positive STRIPE_TRIAL_DAYS", async () => {
    process.env.STRIPE_TRIAL_DAYS = "0";
    render(await UpgradePage());
    expect(screen.getByTestId("paywall-stub")).toHaveAttribute("data-trial", "undefined");
  });

  it("ignores a non-integer STRIPE_TRIAL_DAYS", async () => {
    process.env.STRIPE_TRIAL_DAYS = "abc";
    render(await UpgradePage());
    expect(screen.getByTestId("paywall-stub")).toHaveAttribute("data-trial", "undefined");
  });

  it("treats an unset STRIPE_TRIAL_DAYS as no trial", async () => {
    delete process.env.STRIPE_TRIAL_DAYS;
    render(await UpgradePage());
    expect(screen.getByTestId("paywall-stub")).toHaveAttribute("data-trial", "undefined");
  });
});
