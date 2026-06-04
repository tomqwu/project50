import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { Entitlement } from "@/lib/api/entitlements";

const trackMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => trackMock(...a) }));

import { Paywall } from "./Paywall";

const free: Entitlement = {
  plan: "free",
  isPremium: false,
  status: "NONE",
  currentPeriodEnd: null,
};

const active: Entitlement = {
  plan: "premium",
  isPremium: true,
  status: "ACTIVE",
  currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
};

const trialing: Entitlement = {
  plan: "premium",
  isPremium: true,
  status: "TRIALING",
  currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
};

/** A fetch mock that resolves to a JSON body with the given ok/status. */
function mockFetch(body: unknown, { ok = true, status = 200 } = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

const assign = vi.fn();

beforeEach(() => {
  trackMock.mockReset();
  vi.stubGlobal("fetch", mockFetch({ url: "https://stripe/redirect" }));
  // jsdom's window.location.assign is a no-op we can spy on by replacing it.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  assign.mockReset();
});

describe("Paywall — billing not configured", () => {
  it("shows a disabled upgrade and a coming-soon note, no fetch", () => {
    render(<Paywall entitlement={free} billingConfigured={false} />);
    expect(screen.getByTestId("upgrade-disabled")).toBeDisabled();
    expect(screen.getByTestId("billing-coming-soon")).toBeInTheDocument();
    expect(screen.queryByTestId("upgrade-button")).not.toBeInTheDocument();
  });

  it("does not show the coming-soon/disabled control when configured", () => {
    render(<Paywall entitlement={free} billingConfigured={true} />);
    expect(screen.queryByTestId("upgrade-disabled")).not.toBeInTheDocument();
    expect(screen.queryByTestId("billing-coming-soon")).not.toBeInTheDocument();
  });
});

describe("Paywall — free user upgrade", () => {
  it("renders both plan cards and an Upgrade button", () => {
    render(<Paywall entitlement={free} billingConfigured={true} />);
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(screen.getByText(/go premium/i)).toBeInTheDocument();
    expect(screen.getByTestId("upgrade-button")).toHaveTextContent(/upgrade/i);
  });

  it("POSTs checkout with no body and redirects to the returned url", async () => {
    render(<Paywall entitlement={free} billingConfigured={true} />);
    fireEvent.click(screen.getByTestId("upgrade-button"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://stripe/redirect"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({ method: "POST", body: undefined }),
    );
    expect(trackMock).toHaveBeenCalledWith("upgrade_clicked", { trial: false });
  });

  it("includes a trialPeriodDays body and a trial label when a trial is offered", async () => {
    render(<Paywall entitlement={free} billingConfigured={true} trialPeriodDays={7} />);
    const btn = screen.getByTestId("upgrade-button");
    expect(btn).toHaveTextContent(/start free trial/i);
    fireEvent.click(btn);
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({ body: JSON.stringify({ trialPeriodDays: 7 }) }),
    );
    expect(trackMock).toHaveBeenCalledWith("upgrade_clicked", { trial: true });
  });

  it("shows an error and does not redirect when the response is not ok", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "billing_not_configured" }, { ok: false, status: 503 }));
    render(<Paywall entitlement={free} billingConfigured={true} />);
    fireEvent.click(screen.getByTestId("upgrade-button"));
    await waitFor(() => expect(screen.getByTestId("paywall-error")).toBeInTheDocument());
    expect(assign).not.toHaveBeenCalled();
    // Button is re-enabled to retry.
    expect(screen.getByTestId("upgrade-button")).toBeEnabled();
  });

  it("shows an error when the ok response has no url", async () => {
    vi.stubGlobal("fetch", mockFetch({}, { ok: true, status: 200 }));
    render(<Paywall entitlement={free} billingConfigured={true} />);
    fireEvent.click(screen.getByTestId("upgrade-button"));
    await waitFor(() => expect(screen.getByTestId("paywall-error")).toBeInTheDocument());
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows an error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<Paywall entitlement={free} billingConfigured={true} />);
    fireEvent.click(screen.getByTestId("upgrade-button"));
    await waitFor(() => expect(screen.getByTestId("paywall-error")).toBeInTheDocument());
    expect(assign).not.toHaveBeenCalled();
  });

  it("tolerates a non-JSON response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error("not json")),
      }),
    );
    render(<Paywall entitlement={free} billingConfigured={true} />);
    fireEvent.click(screen.getByTestId("upgrade-button"));
    await waitFor(() => expect(screen.getByTestId("paywall-error")).toBeInTheDocument());
    expect(assign).not.toHaveBeenCalled();
  });

  it("ignores a second click while a request is in flight", async () => {
    let resolve!: (v: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<Paywall entitlement={free} billingConfigured={true} />);
    const btn = screen.getByTestId("upgrade-button");
    // Two synchronous clicks before any re-render flushes: the in-flight guard
    // (not just the disabled attribute) must suppress the second request.
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(btn).toBeDisabled());
    resolve({ ok: true, status: 200, json: () => Promise.resolve({ url: "x" }) });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("x"));
  });
});

describe("Paywall — premium user", () => {
  it("shows a Manage subscription button for an active subscription, no trial banner", () => {
    render(<Paywall entitlement={active} billingConfigured={true} />);
    expect(screen.getByTestId("manage-subscription")).toBeInTheDocument();
    expect(screen.queryByTestId("upgrade-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trial-banner")).not.toBeInTheDocument();
    expect(screen.getByText(/your plan/i)).toBeInTheDocument();
  });

  it("POSTs the portal endpoint and redirects when Manage is clicked", async () => {
    render(<Paywall entitlement={active} billingConfigured={true} />);
    fireEvent.click(screen.getByTestId("manage-subscription"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://stripe/redirect"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/billing/portal",
      expect.objectContaining({ method: "POST", body: undefined }),
    );
  });

  it("surfaces the trial end while TRIALING", () => {
    render(<Paywall entitlement={trialing} billingConfigured={true} />);
    expect(screen.getByTestId("trial-banner")).toHaveTextContent(/trial active until/i);
    expect(screen.getByTestId("manage-subscription")).toBeInTheDocument();
  });

  it("does not render the trial banner when premium but currentPeriodEnd is null", () => {
    render(
      <Paywall
        entitlement={{ ...trialing, currentPeriodEnd: null }}
        billingConfigured={true}
      />,
    );
    expect(screen.queryByTestId("trial-banner")).not.toBeInTheDocument();
  });
});
