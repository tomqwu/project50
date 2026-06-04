import Stripe from "stripe";
import { prisma } from "@project50/db";
import type { SubscriptionStatus } from "./entitlements";
import { HttpError } from "./http";

/**
 * Monetization backend — Stripe subscriptions, OPT-IN.
 *
 * Everything here is gated on STRIPE_SECRET_KEY (the same pattern as Sentry's
 * SENTRY_DSN gate). With no key — the default in dev, CI, and e2e — the billing
 * endpoints throw a clear 503 "billing_not_configured" and no Stripe client is
 * ever constructed, so the app builds and runs without any Stripe env vars.
 */

/** Map a Stripe subscription status string to our SubscriptionStatus enum. */
function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      // incomplete / paused / any future status → no entitlement yet.
      return "NONE";
  }
}

/** True when STRIPE_SECRET_KEY is set, i.e. billing is enabled. */
export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Lazily construct the Stripe client, or throw 503 when not configured. Kept
 * internal so callers go through the gated wrappers below.
 */
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, "billing_not_configured");
  return new Stripe(key);
}

/** Options for {@link createCheckoutSession}. */
export interface CheckoutOptions {
  /**
   * Length of a free trial to grant on the new subscription, in days. When
   * provided and positive, it is passed straight through to Stripe as
   * `subscription_data.trial_period_days` so Checkout starts the subscription in
   * a trial (status `trialing`). Omitted / non-positive values start billing
   * immediately. Safe by default: no trial unless explicitly requested.
   */
  trialPeriodDays?: number;
}

/**
 * Create a Stripe Checkout session for `uid` to subscribe to `priceId` and
 * return its hosted URL. The user id is stashed in `client_reference_id` and
 * subscription metadata so the webhook can attribute the resulting subscription
 * back to the user. Optionally starts the subscription with a free trial via
 * `opts.trialPeriodDays`. Throws 503 when billing is not configured.
 */
export async function createCheckoutSession(
  uid: string,
  priceId: string,
  opts: CheckoutOptions = {},
): Promise<string> {
  const stripe = getStripe();
  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: { userId: uid },
  };
  // Only attach a trial when explicitly requested with a positive day count.
  if (typeof opts.trialPeriodDays === "number" && opts.trialPeriodDays > 0) {
    subscriptionData.trial_period_days = opts.trialPeriodDays;
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: uid,
    subscription_data: subscriptionData,
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing/cancel`,
  });
  if (!session.url) {
    throw new HttpError(502, "checkout_session_no_url");
  }
  return session.url;
}

/**
 * Open a Stripe Billing Portal session for `uid` and return its hosted URL, so
 * the user can manage / cancel their subscription and update payment methods.
 * Resolves the user's Stripe customer from their local Subscription row.
 * Throws 503 when billing is not configured, 409 "no_billing_customer" when the
 * user has no Stripe customer yet, and 502 if Stripe returns no URL.
 */
export async function createPortalSession(uid: string): Promise<string> {
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({
    where: { userId: uid },
    select: { stripeCustomerId: true },
  });
  const customerId = sub?.stripeCustomerId;
  if (!customerId) {
    throw new HttpError(409, "no_billing_customer");
  }
  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/settings`,
  });
  if (!session.url) {
    throw new HttpError(502, "portal_session_no_url");
  }
  return session.url;
}

/** Resolve the app user id a Stripe subscription belongs to, or null. */
function userIdFor(sub: Stripe.Subscription): string | null {
  const fromMetadata = sub.metadata?.userId;
  return fromMetadata && fromMetadata.length > 0 ? fromMetadata : null;
}

/** Upsert the local Subscription row from a Stripe subscription object. */
async function upsertSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = userIdFor(sub);
  // No attributable user (missing metadata) — nothing we can safely persist.
  if (!userId) return;

  const status = mapStatus(sub.status);
  const plan = sub.items.data[0]?.price.id ?? null;
  const periodEndSeconds = sub.items.data[0]?.current_period_end;
  const currentPeriodEnd =
    typeof periodEndSeconds === "number" ? new Date(periodEndSeconds * 1000) : null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const data = {
    status,
    plan,
    currentPeriodEnd,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
  };

  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/**
 * Verify and handle a Stripe webhook. Verifies the signature with
 * STRIPE_WEBHOOK_SECRET, then upserts the user's Subscription on
 * customer.subscription.created / .updated / .deleted. Throws 503 when billing
 * is not configured, and 400 "invalid_signature" when verification fails.
 */
export async function handleWebhookEvent(
  rawBody: string | Buffer,
  signature: string | null,
): Promise<{ received: true }> {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new HttpError(503, "billing_not_configured");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret);
  } catch {
    throw new HttpError(400, "invalid_signature");
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await upsertSubscription(event.data.object);
      break;
    default:
      // Other event types are acknowledged but not acted on.
      break;
  }

  return { received: true };
}
