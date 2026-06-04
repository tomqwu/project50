/**
 * RNTL tests for UpgradeScreen.
 *
 * The IAP dependencies are injected via props (test seams), so the native
 * `react-native-purchases` module is never touched — we still mock it to a stub
 * default export so the screen's `import type` / module graph resolves under jest.
 *
 * Covered: unavailable (unconfigured) state, loading, offering render, empty
 * offering, subscribe success/cancel/inactive/error, restore success/none/error,
 * and the premium-active terminal state.
 */

import React from "react";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react-native";

jest.mock("react-native-purchases", () => ({ __esModule: true, default: {} }));

import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { UpgradeScreen } from "./UpgradeScreen";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makePackage = (
  overrides: Partial<{ title: string; priceString: string }> = {},
): PurchasesPackage =>
  ({
    identifier: "$rc_monthly",
    product: {
      title: overrides.title ?? "Premium Monthly",
      priceString: overrides.priceString ?? "$4.99",
    },
  }) as unknown as PurchasesPackage;

const makeOffering = (packages: PurchasesPackage[]): PurchasesOffering =>
  ({
    identifier: "default",
    availablePackages: packages,
  }) as unknown as PurchasesOffering;

/** Default props with IAP configured and one offering package. */
function configuredProps(overrides: Partial<Parameters<typeof UpgradeScreen>[0]> = {}) {
  return {
    isConfigured: () => true,
    loadOfferings: jest.fn().mockResolvedValue(makeOffering([makePackage()])),
    purchase: jest.fn(),
    restore: jest.fn(),
    ...overrides,
  };
}

// ─── Unavailable (unconfigured) ───────────────────────────────────────────────

describe("UpgradeScreen — unavailable", () => {
  it("shows the unavailable state when IAP is not configured", () => {
    const loadOfferings = jest.fn();
    render(
      <UpgradeScreen
        isConfigured={() => false}
        loadOfferings={loadOfferings}
        purchase={jest.fn()}
        restore={jest.fn()}
      />,
    );
    expect(screen.getByTestId("upgrade-unavailable")).toBeTruthy();
    expect(screen.getByText(/unavailable in this build/i)).toBeTruthy();
    // Does not attempt to load offerings or render actions.
    expect(loadOfferings).not.toHaveBeenCalled();
    expect(screen.queryByTestId("upgrade-subscribe")).toBeNull();
    expect(screen.queryByTestId("upgrade-restore")).toBeNull();
  });
});

// ─── Loading / offering render ────────────────────────────────────────────────

describe("UpgradeScreen — offerings", () => {
  it("shows a loading indicator while offerings load", () => {
    const props = configuredProps({
      loadOfferings: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    render(<UpgradeScreen {...props} />);
    expect(screen.getByTestId("upgrade-loading")).toBeTruthy();
  });

  it("renders the offering package title and price after loading", async () => {
    const props = configuredProps({
      loadOfferings: jest
        .fn()
        .mockResolvedValue(
          makeOffering([makePackage({ title: "Pro Yearly", priceString: "$39.99" })]),
        ),
    });
    render(<UpgradeScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId("upgrade-offering")).toBeTruthy());
    expect(screen.getByTestId("upgrade-package-title").props.children).toBe(
      "Pro Yearly",
    );
    expect(screen.getByTestId("upgrade-package-price").props.children).toBe("$39.99");
    expect(screen.getByTestId("upgrade-subscribe")).toBeTruthy();
    expect(screen.getByTestId("upgrade-restore")).toBeTruthy();
  });

  it("shows a no-offering message when there is no current offering", async () => {
    const props = configuredProps({
      loadOfferings: jest.fn().mockResolvedValue(null),
    });
    render(<UpgradeScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId("upgrade-no-offering")).toBeTruthy());
    // Subscribe is disabled with no package.
    expect(screen.getByTestId("upgrade-subscribe").props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it("shows a no-offering message when the offering has no packages", async () => {
    const props = configuredProps({
      loadOfferings: jest.fn().mockResolvedValue(makeOffering([])),
    });
    render(<UpgradeScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId("upgrade-no-offering")).toBeTruthy());
  });

  it("shows an error when loading offerings throws", async () => {
    const props = configuredProps({
      loadOfferings: jest.fn().mockRejectedValue(new Error("network down")),
    });
    render(<UpgradeScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId("upgrade-error")).toBeTruthy());
    expect(screen.getByText("network down")).toBeTruthy();
  });

  it("shows a generic error when loading offerings rejects with a non-Error", async () => {
    const props = configuredProps({
      loadOfferings: jest.fn().mockRejectedValue("boom"),
    });
    render(<UpgradeScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId("upgrade-error")).toBeTruthy());
    expect(screen.getByText("Failed to load offerings")).toBeTruthy();
  });
});

// ─── Subscribe ────────────────────────────────────────────────────────────────

describe("UpgradeScreen — subscribe", () => {
  async function renderWithOffering(
    overrides: Partial<Parameters<typeof UpgradeScreen>[0]> = {},
  ) {
    const props = configuredProps(overrides);
    render(<UpgradeScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId("upgrade-subscribe")).toBeTruthy());
    return props;
  }

  it("flips to the premium state on a successful purchase", async () => {
    const props = await renderWithOffering({
      purchase: jest.fn().mockResolvedValue(true),
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-subscribe"));
    });
    await waitFor(() => expect(screen.getByTestId("upgrade-premium")).toBeTruthy());
    expect(props.purchase).toHaveBeenCalledTimes(1);
  });

  it("shows a cancelled message when the user cancels (null result)", async () => {
    await renderWithOffering({ purchase: jest.fn().mockResolvedValue(null) });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-subscribe"));
    });
    await waitFor(() => expect(screen.getByTestId("upgrade-info")).toBeTruthy());
    expect(screen.getByText(/cancelled/i)).toBeTruthy();
    expect(screen.queryByTestId("upgrade-premium")).toBeNull();
  });

  it("shows an info message when purchase succeeds but premium is inactive", async () => {
    await renderWithOffering({ purchase: jest.fn().mockResolvedValue(false) });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-subscribe"));
    });
    await waitFor(() => expect(screen.getByTestId("upgrade-info")).toBeTruthy());
    expect(screen.getByText(/not active yet/i)).toBeTruthy();
  });

  it("shows an error when purchase throws", async () => {
    await renderWithOffering({
      purchase: jest.fn().mockRejectedValue(new Error("billing error")),
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-subscribe"));
    });
    await waitFor(() => expect(screen.getByTestId("upgrade-error")).toBeTruthy());
    expect(screen.getByText("billing error")).toBeTruthy();
  });

  it("shows a generic error when purchase rejects with a non-Error", async () => {
    await renderWithOffering({
      purchase: jest.fn().mockRejectedValue("oops"),
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-subscribe"));
    });
    await waitFor(() => expect(screen.getByTestId("upgrade-error")).toBeTruthy());
    expect(screen.getByText("Purchase failed")).toBeTruthy();
  });

  it("shows the busy indicator and disables both buttons while a purchase is in flight", async () => {
    // A purchase that never resolves keeps the screen in the busy state so we can
    // observe the busy indicator + disabled buttons (the `busy` truthy branches).
    await renderWithOffering({
      purchase: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-subscribe"));
    });
    expect(screen.getByTestId("upgrade-busy")).toBeTruthy();
    expect(
      screen.getByTestId("upgrade-subscribe").props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByTestId("upgrade-restore").props.accessibilityState.disabled,
    ).toBe(true);
  });

  it("does nothing when subscribe is pressed with no package", async () => {
    const purchase = jest.fn();
    const props = configuredProps({
      loadOfferings: jest.fn().mockResolvedValue(makeOffering([])),
      purchase,
    });
    render(<UpgradeScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId("upgrade-no-offering")).toBeTruthy());
    // Button is disabled; pressing it must not call purchase.
    fireEvent.press(screen.getByTestId("upgrade-subscribe"));
    expect(purchase).not.toHaveBeenCalled();
  });
});

// ─── Restore ──────────────────────────────────────────────────────────────────

describe("UpgradeScreen — restore", () => {
  async function renderWithOffering(
    overrides: Partial<Parameters<typeof UpgradeScreen>[0]> = {},
  ) {
    const props = configuredProps(overrides);
    render(<UpgradeScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId("upgrade-restore")).toBeTruthy());
    return props;
  }

  it("flips to premium when restore finds an active entitlement", async () => {
    await renderWithOffering({ restore: jest.fn().mockResolvedValue(true) });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-restore"));
    });
    await waitFor(() => expect(screen.getByTestId("upgrade-premium")).toBeTruthy());
  });

  it("shows a 'nothing to restore' message when no entitlement is found", async () => {
    await renderWithOffering({ restore: jest.fn().mockResolvedValue(false) });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-restore"));
    });
    await waitFor(() => expect(screen.getByTestId("upgrade-info")).toBeTruthy());
    expect(screen.getByText(/no previous purchases/i)).toBeTruthy();
  });

  it("shows an error when restore throws", async () => {
    await renderWithOffering({
      restore: jest.fn().mockRejectedValue(new Error("restore failed hard")),
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-restore"));
    });
    await waitFor(() => expect(screen.getByTestId("upgrade-error")).toBeTruthy());
    expect(screen.getByText("restore failed hard")).toBeTruthy();
  });

  it("shows a generic error when restore rejects with a non-Error", async () => {
    await renderWithOffering({
      restore: jest.fn().mockRejectedValue("nope"),
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("upgrade-restore"));
    });
    await waitFor(() => expect(screen.getByTestId("upgrade-error")).toBeTruthy());
    expect(screen.getByText("Restore failed")).toBeTruthy();
  });
});

// ─── Default props (smoke) ────────────────────────────────────────────────────

describe("UpgradeScreen — default deps", () => {
  it("renders the unavailable state with default props (IAP unconfigured under jest)", () => {
    // No props: defaults to the real iap lib, which is unconfigured under jest,
    // so we get the unavailable state without touching the native module.
    render(<UpgradeScreen />);
    expect(screen.getByTestId("upgrade-unavailable")).toBeTruthy();
  });
});
