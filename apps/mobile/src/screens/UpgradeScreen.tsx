/**
 * UpgradeScreen — premium subscription purchase / restore.
 *
 * Backed by the config-gated IAP layer (src/lib/iap.ts → react-native-purchases,
 * StoreKit on iOS / Play Billing on Android). Behaviour:
 *   - When IAP is NOT configured (no RevenueCat key — dev/CI/Expo Go), shows a
 *     clear "unavailable" state with no Subscribe/Restore actions.
 *   - When configured, loads the current premium offering and renders the
 *     subscription package (title + price) with a Subscribe button and a Restore
 *     button. A successful purchase or restore flips to a "premium active" state.
 *
 * The iap library is injected (defaults to the real module) so the screen can be
 * tested via RNTL without the native module — mirroring the env/dep injection
 * used across this codebase.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import {
  isIapConfigured as defaultIsIapConfigured,
  getOfferings as defaultGetOfferings,
  purchasePremium as defaultPurchasePremium,
  restorePurchases as defaultRestorePurchases,
} from "../lib/iap";
import { colors } from "../theme";
import { elevation, ripple } from "../components/platform";

export interface UpgradeScreenProps {
  /** Test seam: override the IAP-configured check. */
  isConfigured?: () => boolean;
  /** Test seam: override offering fetch. */
  loadOfferings?: () => Promise<PurchasesOffering | null>;
  /** Test seam: override purchase. Resolves true=premium, false=not, null=cancelled. */
  purchase?: (pkg: PurchasesPackage) => Promise<boolean | null>;
  /** Test seam: override restore. Resolves true when premium is active. */
  restore?: () => Promise<boolean>;
}

export function UpgradeScreen({
  isConfigured = defaultIsIapConfigured,
  loadOfferings = defaultGetOfferings,
  purchase = defaultPurchasePremium,
  restore = defaultRestorePurchases,
}: UpgradeScreenProps): React.JSX.Element {
  const configured = isConfigured();

  const [loading, setLoading] = useState(configured);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [busy, setBusy] = useState(false);
  const [premium, setPremium] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const current = await loadOfferings();
        /* istanbul ignore else — cancellation guard */
        if (!cancelled) {
          setOffering(current);
          setLoading(false);
        }
      } catch (e) {
        /* istanbul ignore else — cancellation guard */
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load offerings");
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [configured, loadOfferings]);

  const premiumPackage: PurchasesPackage | null =
    offering?.availablePackages[0] ?? null;

  const handleSubscribe = useCallback(async () => {
    /* istanbul ignore next — safety guard unreachable via the rendered UI: the
       Subscribe button is `disabled` whenever premiumPackage is null, so onPress
       never fires without a package. No branching logic of our own beyond this. */
    if (!premiumPackage) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await purchase(premiumPackage);
      if (result === null) {
        setInfo("Purchase cancelled.");
      } else if (result) {
        setPremium(true);
      } else {
        setInfo("Purchase completed, but premium is not active yet.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  }, [premiumPackage, purchase]);

  const handleRestore = useCallback(async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const active = await restore();
      if (active) {
        setPremium(true);
      } else {
        setInfo("No previous purchases to restore.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }, [restore]);

  // ─── Unavailable (not configured) ──────────────────────────────────────────
  if (!configured) {
    return (
      <View style={styles.center} testID="upgrade-unavailable">
        <Text style={styles.title} accessibilityRole="header">
          Premium
        </Text>
        <Text style={styles.body}>
          In-app purchases are unavailable in this build.
        </Text>
      </View>
    );
  }

  // ─── Premium active ────────────────────────────────────────────────────────
  if (premium) {
    return (
      <View style={styles.center} testID="upgrade-premium">
        <Text style={styles.title} accessibilityRole="header">
          You&apos;re Premium
        </Text>
        <Text style={styles.body}>Thanks for supporting project50!</Text>
      </View>
    );
  }

  // ─── Loading offerings ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center} testID="upgrade-loading">
        <ActivityIndicator
          color={colors.volt}
          size="large"
          accessibilityLabel="Loading subscription options"
        />
      </View>
    );
  }

  // ─── Configured: offering (or empty) + actions ─────────────────────────────
  return (
    <View style={styles.container} testID="upgrade-screen">
      <Text style={styles.title} accessibilityRole="header">
        Go Premium
      </Text>

      {premiumPackage ? (
        <View
          style={styles.card}
          testID="upgrade-offering"
          accessible
          accessibilityLabel={`${premiumPackage.product.title}, ${premiumPackage.product.priceString}`}
        >
          <Text style={styles.packageTitle} testID="upgrade-package-title">
            {premiumPackage.product.title}
          </Text>
          <Text style={styles.price} testID="upgrade-package-price">
            {premiumPackage.product.priceString}
          </Text>
        </View>
      ) : (
        <Text style={styles.body} testID="upgrade-no-offering">
          No subscription is available right now.
        </Text>
      )}

      {error ? (
        <Text style={styles.error} testID="upgrade-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {info ? (
        <Text style={styles.info} testID="upgrade-info" accessibilityRole="alert">
          {info}
        </Text>
      ) : null}

      {busy ? (
        <ActivityIndicator
          color={colors.volt}
          testID="upgrade-busy"
          accessibilityLabel="Processing"
        />
      ) : null}

      <Pressable
        testID="upgrade-subscribe"
        style={[styles.button, (!premiumPackage || busy) && styles.buttonDisabled]}
        disabled={!premiumPackage || busy}
        onPress={() => void handleSubscribe()}
        android_ripple={ripple("rgba(18, 16, 19, 0.2)")}
        accessibilityRole="button"
        accessibilityLabel="Subscribe"
        accessibilityState={{ disabled: !premiumPackage || busy, busy }}
      >
        <Text style={styles.buttonText}>Subscribe</Text>
      </Pressable>

      <Pressable
        testID="upgrade-restore"
        style={[styles.restoreButton, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={() => void handleRestore()}
        android_ripple={ripple()}
        accessibilityRole="button"
        accessibilityLabel="Restore purchases"
        accessibilityState={{ disabled: busy, busy }}
      >
        <Text style={styles.restoreText}>Restore Purchases</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.charcoal,
    padding: 24,
    gap: 16,
  },
  center: {
    flex: 1,
    backgroundColor: colors.charcoal,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  body: { color: colors.text, fontSize: 15, opacity: 0.85, textAlign: "center" },
  card: {
    backgroundColor: "#1e1e1e",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#333",
    gap: 4,
    ...elevation(1),
  },
  packageTitle: { color: colors.text, fontSize: 18, fontWeight: "600" },
  price: { color: colors.volt, fontSize: 16, fontWeight: "700" },
  button: {
    backgroundColor: colors.volt,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    overflow: "hidden",
    ...elevation(2),
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.charcoal, fontSize: 16, fontWeight: "700" },
  restoreButton: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    overflow: "hidden",
  },
  restoreText: { color: colors.volt, fontSize: 14, fontWeight: "600" },
  error: { color: "#ff6b6b", fontSize: 14, textAlign: "center" },
  info: { color: colors.text, fontSize: 14, textAlign: "center", opacity: 0.85 },
});
