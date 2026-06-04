import { requireUser } from "@/lib/session";
import { getEntitlement } from "@/lib/api/entitlements";
import { isBillingConfigured } from "@/lib/api/billing";
import { Paywall } from "./_components/Paywall";

/** Parse STRIPE_TRIAL_DAYS into a positive integer, or undefined (no trial). */
function trialDaysFromEnv(): number | undefined {
  const raw = process.env.STRIPE_TRIAL_DAYS;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * /upgrade — the paywall / upgrade page. Resolves the signed-in user's
 * entitlement and whether billing is configured on the server, then renders the
 * client {@link Paywall}. Works without Stripe keys (the Paywall shows a
 * disabled "coming soon" state rather than erroring).
 */
export default async function UpgradePage() {
  const uid = await requireUser();
  const entitlement = await getEntitlement(uid);
  return (
    <Paywall
      entitlement={entitlement}
      billingConfigured={isBillingConfigured()}
      trialPeriodDays={trialDaysFromEnv()}
    />
  );
}
