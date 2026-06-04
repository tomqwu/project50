import { prisma } from "@project50/db";
import { HttpError } from "./http";

/**
 * The Subscription.status enum values (mirrors the Prisma `SubscriptionStatus`
 * enum in packages/db/prisma/schema.prisma). Declared locally as a string-literal
 * union so the web app doesn't take a direct dependency on `@prisma/client`,
 * matching how the rest of the web layer types domain enums.
 */
export type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "NONE";

/** Plans a user can be on. Anyone without an active subscription is "free". */
export type Plan = "free" | "premium";

/** The resolved entitlement for a user: their plan and a premium flag. */
export interface Entitlement {
  plan: Plan;
  isPremium: boolean;
  /** The raw subscription status; "NONE" when the user has no subscription. */
  status: SubscriptionStatus;
  /**
   * When the current (paid or trial) period ends, if known. For a TRIALING
   * subscription this is the trial-end the UI surfaces; null when unknown.
   */
  currentPeriodEnd: Date | null;
}

/**
 * Subscription statuses that grant premium access. A subscription is "live"
 * while ACTIVE or TRIALING; PAST_DUE / CANCELED / NONE (and no row at all)
 * fall back to free.
 */
const PREMIUM_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["ACTIVE", "TRIALING"]);

/**
 * Pure mapping from a subscription status to an entitlement. Exposed for
 * testing and reuse; `getEntitlement` layers the DB read on top.
 */
export function entitlementForStatus(
  status: SubscriptionStatus | null | undefined,
  currentPeriodEnd: Date | null = null,
): Entitlement {
  const resolved = status ?? "NONE";
  const isPremium = PREMIUM_STATUSES.has(resolved);
  return {
    plan: isPremium ? "premium" : "free",
    isPremium,
    status: resolved,
    currentPeriodEnd,
  };
}

/**
 * Resolve a user's entitlement by reading their Subscription row. Users with no
 * subscription, or a non-premium status, are "free". ACTIVE / TRIALING → premium.
 * Also surfaces the raw status and currentPeriodEnd (e.g. for trial countdowns).
 */
export async function getEntitlement(uid: string): Promise<Entitlement> {
  const sub = await prisma.subscription.findUnique({
    where: { userId: uid },
    select: { status: true, currentPeriodEnd: true },
  });
  return entitlementForStatus(sub?.status, sub?.currentPeriodEnd ?? null);
}

/**
 * Guard for premium-only features: resolves the user's entitlement and throws a
 * 403 HttpError ("premium_required") unless they are premium.
 */
export async function requirePremium(uid: string): Promise<Entitlement> {
  const entitlement = await getEntitlement(uid);
  if (!entitlement.isPremium) {
    throw new HttpError(403, "premium_required");
  }
  return entitlement;
}
