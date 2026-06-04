import Stripe from "stripe";
import { prisma } from "@project50/db";
import type { SubscriptionStatus } from "./entitlements";
import { HttpError } from "./http";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

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
 *
 * Stripe Tax (#77): we enable `automatic_tax` so Stripe computes and collects the
 * correct sales tax / VAT / GST per the customer's location, and require a billing
 * address (`billing_address_collection: "required"`) so Stripe has a location to
 * tax against. This only affects live Stripe Checkout and is a no-op without keys.
 * REGISTRATION REQUIRED: automatic tax only actually charges tax once you have
 * activated Stripe Tax and added your tax registrations in the Stripe Dashboard
 * (Settings → Tax). Until then Stripe returns a zero tax amount but the flow is
 * otherwise unchanged. See .env.example / docs note.
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
    // Stripe Tax (#77): compute tax automatically and collect a billing address
    // (required so Stripe has a jurisdiction to tax against).
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
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

/** Extract the Stripe customer id from a subscription or invoice, or null. */
function customerIdOf(obj: {
  customer?: string | { id: string } | null;
}): string | null {
  const c = obj.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

/**
 * Mark the subscription owned by `customerId` as `status`, only when a matching
 * local Subscription row exists. Used by dunning to flip PAST_DUE / ACTIVE
 * straight from invoice events (which carry no userId metadata, but do carry the
 * customer). No-op when no row matches the customer.
 */
async function setStatusByCustomer(
  customerId: string | null,
  status: SubscriptionStatus,
): Promise<void> {
  if (!customerId) return;
  await prisma.subscription.updateMany({
    where: { stripeCustomerId: customerId },
    data: { status },
  });
}

/**
 * Open a Stripe Billing Portal session for a customer id (webhook context, where
 * there is no logged-in request). Returns the hosted URL, or null if Stripe
 * returns none — so a failed link never blocks the dunning email.
 */
async function portalUrlForCustomer(
  stripe: Stripe,
  customerId: string,
): Promise<string | null> {
  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/settings`,
  });
  return session.url ?? null;
}

/** Format a Stripe minor-unit amount + currency as a human string, e.g. "$12.00". */
function formatAmount(amount: number | null | undefined, currency: string | null | undefined): string {
  const cents = typeof amount === "number" ? amount : 0;
  const cur = (currency ?? "usd").toUpperCase();
  const major = (cents / 100).toFixed(2);
  return `${major} ${cur}`;
}

/**
 * Dunning (#75): a payment failed. Mark the subscription PAST_DUE and, when email
 * is configured and the invoice carries a recipient address, send a "payment
 * failed — update your card" email with a billing-portal link. Email failures are
 * swallowed (sendEmail never throws) so the webhook still acknowledges.
 */
async function handlePaymentFailed(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  const customerId = customerIdOf(invoice);
  await setStatusByCustomer(customerId, "PAST_DUE");

  const to = invoice.customer_email;
  if (!isEmailConfigured() || !to || !customerId) return;

  let portalUrl: string | null = null;
  try {
    portalUrl = await portalUrlForCustomer(stripe, customerId);
  } catch (err) {
    logger.error("dunning: failed to create portal link", { customerId, err: String(err) });
  }
  const linkLine = portalUrl
    ? `Update your payment method here: ${portalUrl}`
    : "Update your payment method from your account settings.";

  await sendEmail({
    to,
    subject: "Your Project 50 payment failed — please update your card",
    text: [
      "We couldn't process your latest Project 50 subscription payment.",
      "Your subscription is now past due. Please update your payment method to keep your access.",
      linkLine,
    ].join("\n\n"),
    html: [
      "<p>We couldn't process your latest Project 50 subscription payment.</p>",
      "<p>Your subscription is now past due. Please update your payment method to keep your access.</p>",
      portalUrl
        ? `<p><a href="${portalUrl}">Update your payment method</a></p>`
        : "<p>Update your payment method from your account settings.</p>",
    ].join(""),
  });
}

/**
 * Receipts (#76): an invoice was paid. Clear any PAST_DUE state back to ACTIVE
 * and, when email is configured and the invoice carries a recipient, send a
 * receipt email (amount, date, hosted invoice URL). Email failures are swallowed.
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  await setStatusByCustomer(customerIdOf(invoice), "ACTIVE");

  const to = invoice.customer_email;
  if (!isEmailConfigured() || !to) return;

  const amount = formatAmount(invoice.amount_paid, invoice.currency);
  const created = invoice.created ? new Date(invoice.created * 1000) : new Date();
  const dateStr = created.toISOString().slice(0, 10);
  const hostedUrl = invoice.hosted_invoice_url ?? null;
  const viewLine = hostedUrl ? `View or download your invoice: ${hostedUrl}` : null;

  await sendEmail({
    to,
    subject: "Your Project 50 receipt",
    text: [
      "Thanks for your Project 50 subscription payment.",
      `Amount: ${amount}`,
      `Date: ${dateStr}`,
      ...(viewLine ? [viewLine] : []),
    ].join("\n\n"),
    html: [
      "<p>Thanks for your Project 50 subscription payment.</p>",
      `<p>Amount: ${amount}<br/>Date: ${dateStr}</p>`,
      hostedUrl ? `<p><a href="${hostedUrl}">View or download your invoice</a></p>` : "",
    ].join(""),
  });
}

/**
 * Refund a charge (#76), admin helper / thin wrapper over the Stripe API. Gated
 * on STRIPE_SECRET_KEY (throws 503 when billing is not configured). Refunds are
 * normally issued from the Stripe Dashboard (Payments → … → Refund); this exists
 * for scripted / admin use. Returns the created Stripe Refund.
 */
export async function refundCharge(chargeId: string): Promise<Stripe.Refund> {
  const stripe = getStripe();
  return stripe.refunds.create({ charge: chargeId });
}

/**
 * Verify and handle a Stripe webhook. Verifies the signature with
 * STRIPE_WEBHOOK_SECRET, then:
 *  - upserts the user's Subscription on customer.subscription.created/.updated/
 *    .deleted (the .updated path also clears/sets PAST_DUE via the mapped status);
 *  - dunning (#75): invoice.payment_failed → PAST_DUE + "update your card" email;
 *  - receipts (#76): invoice.paid / invoice.payment_succeeded → ACTIVE + receipt
 *    email.
 * Throws 503 when billing is not configured, and 400 "invalid_signature" when
 * verification fails.
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
    case "invoice.payment_failed":
      // Dunning (#75): flag past due + nudge to update the card.
      await handlePaymentFailed(stripe, event.data.object);
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      // Receipts (#76) + recover from dunning: clear PAST_DUE → ACTIVE + receipt.
      await handleInvoicePaid(event.data.object);
      break;
    default:
      // Other event types are acknowledged but not acted on.
      break;
  }

  return { received: true };
}
