// @vitest-environment node
import { describe, beforeEach, afterEach, afterAll, it, expect, vi } from "vitest";
import { prisma, resetDb, createUser } from "../../test/db";
import { HttpError } from "./http";

// http.ts imports @/lib/session → next-auth, which can't load under vitest.
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

// Mock the stripe SDK so we never hit the network. The default export is the
// Stripe constructor; each instance exposes the surface billing.ts uses. The
// mocks live in vi.hoisted() so they exist when the (hoisted) vi.mock factory runs.
const { createSession, constructEvent, createPortal, createRefund, stripeCtor } = vi.hoisted(
  () => {
    const createSession = vi.fn();
    const constructEvent = vi.fn();
    const createPortal = vi.fn();
    const createRefund = vi.fn();
    const stripeCtor = vi.fn(() => ({
      checkout: { sessions: { create: createSession } },
      billingPortal: { sessions: { create: createPortal } },
      refunds: { create: createRefund },
      webhooks: { constructEvent },
    }));
    return { createSession, constructEvent, createPortal, createRefund, stripeCtor };
  },
);
vi.mock("stripe", () => ({ default: stripeCtor }));

// Mock the email service so we can assert on / toggle email sends without env.
const { sendEmailMock, isEmailConfiguredMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  isEmailConfiguredMock: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
  isEmailConfigured: isEmailConfiguredMock,
}));

import {
  isBillingConfigured,
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
  refundCharge,
} from "./billing";

const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  // Default: configured. Individual tests override as needed.
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.APP_BASE_URL = "https://app.test";
  // Default: email configured + sends succeed. Individual tests override.
  isEmailConfiguredMock.mockReturnValue(true);
  sendEmailMock.mockResolvedValue({ sent: true, id: "em_1" });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Build a minimal Stripe.Subscription-shaped object for upsert tests. */
function fakeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    status: "active",
    customer: "cus_123",
    metadata: { userId: "OVERRIDE_ME" },
    items: {
      data: [{ price: { id: "price_abc" }, current_period_end: 1_900_000_000 }],
    },
    ...overrides,
  };
}

/** Build a minimal Stripe.Invoice-shaped object for dunning/receipt tests. */
function fakeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_123",
    customer: "cus_123",
    customer_email: "buyer@example.com",
    amount_paid: 1200,
    currency: "usd",
    created: 1_700_000_000,
    hosted_invoice_url: "https://invoice.stripe/in_123",
    ...overrides,
  };
}

describe("isBillingConfigured", () => {
  it("is true when STRIPE_SECRET_KEY is set", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    expect(isBillingConfigured()).toBe(true);
  });

  it("is false when STRIPE_SECRET_KEY is absent", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(isBillingConfigured()).toBe(false);
  });
});

describe("createCheckoutSession", () => {
  it("throws 503 billing_not_configured when no key", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    let thrown: HttpError | undefined;
    try {
      await createCheckoutSession("u1", "price_1");
    } catch (err) {
      thrown = err as HttpError;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown!.status).toBe(503);
    expect(thrown!.code).toBe("billing_not_configured");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("creates a subscription checkout session and returns its url", async () => {
    createSession.mockResolvedValue({ url: "https://checkout.stripe/x" });
    const url = await createCheckoutSession("user-1", "price_premium");
    expect(url).toBe("https://checkout.stripe/x");
    expect(createSession).toHaveBeenCalledTimes(1);
    const arg = createSession.mock.calls[0]![0];
    expect(arg).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_premium", quantity: 1 }],
      client_reference_id: "user-1",
      subscription_data: { metadata: { userId: "user-1" } },
      success_url: expect.stringContaining("https://app.test/billing/success"),
      cancel_url: "https://app.test/billing/cancel",
    });
  });

  it("enables Stripe Tax (automatic_tax + required billing address) on checkout", async () => {
    createSession.mockResolvedValue({ url: "https://checkout.stripe/tax" });
    await createCheckoutSession("user-tax", "price_premium");
    const arg = createSession.mock.calls[0]![0];
    expect(arg.automatic_tax).toEqual({ enabled: true });
    expect(arg.billing_address_collection).toBe("required");
  });

  it("falls back to localhost when APP_BASE_URL is unset", async () => {
    delete process.env.APP_BASE_URL;
    createSession.mockResolvedValue({ url: "https://checkout.stripe/y" });
    await createCheckoutSession("u2", "price_2");
    const arg = createSession.mock.calls[0]![0];
    expect(arg.cancel_url).toBe("http://localhost:3000/billing/cancel");
  });

  it("throws 502 when Stripe returns a session without a url", async () => {
    createSession.mockResolvedValue({ url: null });
    let thrown: HttpError | undefined;
    try {
      await createCheckoutSession("u3", "price_3");
    } catch (err) {
      thrown = err as HttpError;
    }
    expect(thrown!.status).toBe(502);
    expect(thrown!.code).toBe("checkout_session_no_url");
  });

  it("omits trial settings by default", async () => {
    createSession.mockResolvedValue({ url: "https://checkout.stripe/t0" });
    await createCheckoutSession("u-notrial", "price_x");
    const arg = createSession.mock.calls[0]![0];
    expect(arg.subscription_data).toEqual({ metadata: { userId: "u-notrial" } });
    expect(arg.subscription_data.trial_period_days).toBeUndefined();
  });

  it("passes trial_period_days to Stripe when a positive trial is requested", async () => {
    createSession.mockResolvedValue({ url: "https://checkout.stripe/t" });
    await createCheckoutSession("u-trial", "price_x", { trialPeriodDays: 7 });
    const arg = createSession.mock.calls[0]![0];
    expect(arg.subscription_data).toMatchObject({
      metadata: { userId: "u-trial" },
      trial_period_days: 7,
    });
  });

  it("ignores a non-positive trial (no trial_period_days)", async () => {
    createSession.mockResolvedValue({ url: "https://checkout.stripe/t2" });
    await createCheckoutSession("u-trial0", "price_x", { trialPeriodDays: 0 });
    const arg = createSession.mock.calls[0]![0];
    expect(arg.subscription_data.trial_period_days).toBeUndefined();
  });
});

describe("createPortalSession", () => {
  it("throws 503 billing_not_configured when no key", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    let thrown: HttpError | undefined;
    try {
      await createPortalSession("u1");
    } catch (err) {
      thrown = err as HttpError;
    }
    expect(thrown!.status).toBe(503);
    expect(thrown!.code).toBe("billing_not_configured");
    expect(createPortal).not.toHaveBeenCalled();
  });

  it("throws 409 when the user has no Stripe customer", async () => {
    const user = await createUser();
    let thrown: HttpError | undefined;
    try {
      await createPortalSession(user.id);
    } catch (err) {
      thrown = err as HttpError;
    }
    expect(thrown!.status).toBe(409);
    expect(thrown!.code).toBe("no_billing_customer");
    expect(createPortal).not.toHaveBeenCalled();
  });

  it("opens a billing portal for the user's Stripe customer and returns its url", async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", stripeCustomerId: "cus_portal" },
    });
    createPortal.mockResolvedValue({ url: "https://billing.stripe/portal" });
    const url = await createPortalSession(user.id);
    expect(url).toBe("https://billing.stripe/portal");
    const arg = createPortal.mock.calls[0]![0];
    expect(arg).toMatchObject({
      customer: "cus_portal",
      return_url: "https://app.test/settings",
    });
  });

  it("falls back to localhost return_url when APP_BASE_URL is unset", async () => {
    delete process.env.APP_BASE_URL;
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", stripeCustomerId: "cus_p2" },
    });
    createPortal.mockResolvedValue({ url: "https://billing.stripe/p2" });
    await createPortalSession(user.id);
    expect(createPortal.mock.calls[0]![0].return_url).toBe("http://localhost:3000/settings");
  });

  it("throws 502 when Stripe returns a portal session without a url", async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", stripeCustomerId: "cus_p3" },
    });
    createPortal.mockResolvedValue({ url: null });
    let thrown: HttpError | undefined;
    try {
      await createPortalSession(user.id);
    } catch (err) {
      thrown = err as HttpError;
    }
    expect(thrown!.status).toBe(502);
    expect(thrown!.code).toBe("portal_session_no_url");
  });
});

describe("handleWebhookEvent", () => {
  it("throws 503 when STRIPE_SECRET_KEY is absent", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(handleWebhookEvent("{}", "sig")).rejects.toMatchObject({
      status: 503,
      code: "billing_not_configured",
    });
  });

  it("throws 503 when STRIPE_WEBHOOK_SECRET is absent", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    await expect(handleWebhookEvent("{}", "sig")).rejects.toMatchObject({
      status: 503,
      code: "billing_not_configured",
    });
  });

  it("throws 400 invalid_signature when verification fails", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    await expect(handleWebhookEvent("{}", "sig")).rejects.toMatchObject({
      status: 400,
      code: "invalid_signature",
    });
  });

  it("treats a missing signature header as empty string", async () => {
    constructEvent.mockReturnValue({ type: "ping" });
    await expect(handleWebhookEvent("{}", null)).resolves.toEqual({
      received: true,
    });
    expect(constructEvent).toHaveBeenCalledWith("{}", "", "whsec_test");
  });

  it("ignores unrelated event types but acknowledges them", async () => {
    constructEvent.mockReturnValue({ type: "customer.created", data: {} });
    await expect(handleWebhookEvent("{}", "sig")).resolves.toEqual({
      received: true,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("upserts the user's subscription on subscription.created", async () => {
    const user = await createUser();
    constructEvent.mockReturnValue({
      type: "customer.subscription.created",
      data: { object: fakeSubscription({ metadata: { userId: user.id } }) },
    });

    const res = await handleWebhookEvent("raw", "sig");
    expect(res).toEqual({ received: true });

    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub).toMatchObject({
      userId: user.id,
      status: "ACTIVE",
      plan: "price_abc",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
    });
    expect(sub!.currentPeriodEnd).toEqual(new Date(1_900_000_000 * 1000));
  });

  it("updates an existing subscription on subscription.updated", async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", plan: "old" },
    });
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: fakeSubscription({
          status: "past_due",
          metadata: { userId: user.id },
        }),
      },
    });

    await handleWebhookEvent("raw", "sig");
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub!.status).toBe("PAST_DUE");
    expect(sub!.plan).toBe("price_abc");
  });

  it("maps a canceled subscription on subscription.deleted", async () => {
    const user = await createUser();
    constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: fakeSubscription({
          status: "canceled",
          metadata: { userId: user.id },
        }),
      },
    });

    await handleWebhookEvent("raw", "sig");
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub!.status).toBe("CANCELED");
  });

  it("no-ops when the subscription has no attributable userId", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.created",
      data: { object: fakeSubscription({ metadata: {} }) },
    });
    await handleWebhookEvent("raw", "sig");
    expect(await prisma.subscription.count()).toBe(0);
  });

  it("reads the customer id from a Customer object", async () => {
    const user = await createUser();
    constructEvent.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: fakeSubscription({
          customer: { id: "cus_obj" },
          metadata: { userId: user.id },
        }),
      },
    });
    await handleWebhookEvent("raw", "sig");
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub!.stripeCustomerId).toBe("cus_obj");
  });

  it("handles missing price/period gracefully", async () => {
    const user = await createUser();
    constructEvent.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: fakeSubscription({
          metadata: { userId: user.id },
          items: { data: [] },
        }),
      },
    });
    await handleWebhookEvent("raw", "sig");
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub!.plan).toBeNull();
    expect(sub!.currentPeriodEnd).toBeNull();
  });

  it("maps a trialing subscription to TRIALING", async () => {
    const user = await createUser();
    constructEvent.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: fakeSubscription({
          status: "trialing",
          metadata: { userId: user.id },
        }),
      },
    });
    await handleWebhookEvent("raw", "sig");
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub!.status).toBe("TRIALING");
  });

  it("maps a past_due subscription to PAST_DUE", async () => {
    const user = await createUser();
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: fakeSubscription({
          status: "past_due",
          metadata: { userId: user.id },
        }),
      },
    });
    await handleWebhookEvent("raw", "sig");
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub!.status).toBe("PAST_DUE");
  });

  it("maps unknown/incomplete statuses to NONE", async () => {
    const user = await createUser();
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: fakeSubscription({
          status: "incomplete",
          metadata: { userId: user.id },
        }),
      },
    });
    await handleWebhookEvent("raw", "sig");
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub!.status).toBe("NONE");
  });

  it("maps unpaid → PAST_DUE and incomplete_expired → CANCELED", async () => {
    const u1 = await createUser({ handle: "unpaiduser" });
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: fakeSubscription({
          id: "sub_unpaid",
          customer: "cus_unpaid",
          status: "unpaid",
          metadata: { userId: u1.id },
        }),
      },
    });
    await handleWebhookEvent("raw", "sig");
    expect((await prisma.subscription.findUnique({ where: { userId: u1.id } }))!.status).toBe(
      "PAST_DUE",
    );

    const u2 = await createUser({ handle: "expireduser" });
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: fakeSubscription({
          id: "sub_expired",
          customer: "cus_expired",
          status: "incomplete_expired",
          metadata: { userId: u2.id },
        }),
      },
    });
    await handleWebhookEvent("raw", "sig");
    expect((await prisma.subscription.findUnique({ where: { userId: u2.id } }))!.status).toBe(
      "CANCELED",
    );
  });

  // ── Dunning (#75) ────────────────────────────────────────────────────────
  it("marks the subscription PAST_DUE and emails on invoice.payment_failed", async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", stripeCustomerId: "cus_dun" },
    });
    createPortal.mockResolvedValue({ url: "https://billing.stripe/portal" });
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: fakeInvoice({ customer: "cus_dun", customer_email: "dun@example.com" }),
      },
    });

    const res = await handleWebhookEvent("raw", "sig");
    expect(res).toEqual({ received: true });

    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(sub!.status).toBe("PAST_DUE");

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0]![0];
    expect(mail.to).toBe("dun@example.com");
    expect(mail.subject).toMatch(/payment failed/i);
    expect(mail.text).toContain("https://billing.stripe/portal");
    expect(mail.html).toContain("https://billing.stripe/portal");
  });

  it("uses a fallback link line when the portal session has no url", async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", stripeCustomerId: "cus_dun2" },
    });
    createPortal.mockResolvedValue({ url: null });
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: fakeInvoice({ customer: "cus_dun2" }) },
    });
    await handleWebhookEvent("raw", "sig");
    const mail = sendEmailMock.mock.calls[0]![0];
    expect(mail.text).toContain("account settings");
    expect(mail.html).toContain("account settings");
  });

  it("still marks PAST_DUE and sends fallback when the portal call throws", async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", stripeCustomerId: "cus_dun3" },
    });
    createPortal.mockRejectedValue(new Error("stripe down"));
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: fakeInvoice({ customer: "cus_dun3" }) },
    });
    await handleWebhookEvent("raw", "sig");
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(sub!.status).toBe("PAST_DUE");
    expect(sendEmailMock.mock.calls[0]![0].text).toContain("account settings");
  });

  it("marks PAST_DUE but skips email when email is not configured", async () => {
    isEmailConfiguredMock.mockReturnValue(false);
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", stripeCustomerId: "cus_dun4" },
    });
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: fakeInvoice({ customer: "cus_dun4" }) },
    });
    await handleWebhookEvent("raw", "sig");
    expect((await prisma.subscription.findUnique({ where: { userId: user.id } }))!.status).toBe(
      "PAST_DUE",
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(createPortal).not.toHaveBeenCalled();
  });

  it("skips the dunning email when the invoice has no customer_email", async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", stripeCustomerId: "cus_dun5" },
    });
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: fakeInvoice({ customer: "cus_dun5", customer_email: null }) },
    });
    await handleWebhookEvent("raw", "sig");
    expect((await prisma.subscription.findUnique({ where: { userId: user.id } }))!.status).toBe(
      "PAST_DUE",
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("reads the customer id from an expanded Customer object and falls back to localhost portal return_url", async () => {
    delete process.env.APP_BASE_URL;
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "ACTIVE", stripeCustomerId: "cus_obj_dun" },
    });
    createPortal.mockResolvedValue({ url: "https://billing.stripe/obj" });
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: fakeInvoice({ customer: { id: "cus_obj_dun" }, customer_email: "obj@example.com" }),
      },
    });
    await handleWebhookEvent("raw", "sig");
    expect((await prisma.subscription.findUnique({ where: { userId: user.id } }))!.status).toBe(
      "PAST_DUE",
    );
    expect(createPortal.mock.calls[0]![0].return_url).toBe("http://localhost:3000/settings");
    expect(sendEmailMock.mock.calls[0]![0].text).toContain("https://billing.stripe/obj");
  });

  it("no-ops the status update when the invoice has no customer", async () => {
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: fakeInvoice({ customer: null, customer_email: "x@example.com" }) },
    });
    await handleWebhookEvent("raw", "sig");
    // No matching subscription rows to update; email is skipped (no customer).
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // ── Receipts (#76) ───────────────────────────────────────────────────────
  it("clears PAST_DUE → ACTIVE and emails a receipt on invoice.paid", async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "PAST_DUE", stripeCustomerId: "cus_rcpt" },
    });
    constructEvent.mockReturnValue({
      type: "invoice.paid",
      data: {
        object: fakeInvoice({
          customer: "cus_rcpt",
          customer_email: "rcpt@example.com",
          amount_paid: 1999,
          currency: "usd",
        }),
      },
    });

    await handleWebhookEvent("raw", "sig");
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(sub!.status).toBe("ACTIVE");

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0]![0];
    expect(mail.to).toBe("rcpt@example.com");
    expect(mail.subject).toMatch(/receipt/i);
    expect(mail.text).toContain("19.99 USD");
    expect(mail.text).toContain("2023-11-14");
    expect(mail.text).toContain("https://invoice.stripe/in_123");
    expect(mail.html).toContain("https://invoice.stripe/in_123");
  });

  it("treats invoice.payment_succeeded the same as invoice.paid (recovery)", async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "PAST_DUE", stripeCustomerId: "cus_succ" },
    });
    constructEvent.mockReturnValue({
      type: "invoice.payment_succeeded",
      data: { object: fakeInvoice({ customer: "cus_succ" }) },
    });
    await handleWebhookEvent("raw", "sig");
    expect((await prisma.subscription.findUnique({ where: { userId: user.id } }))!.status).toBe(
      "ACTIVE",
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("clears PAST_DUE → ACTIVE but skips the receipt email when email is not configured", async () => {
    isEmailConfiguredMock.mockReturnValue(false);
    const user = await createUser();
    await prisma.subscription.create({
      data: { userId: user.id, status: "PAST_DUE", stripeCustomerId: "cus_rcpt2" },
    });
    constructEvent.mockReturnValue({
      type: "invoice.paid",
      data: { object: fakeInvoice({ customer: "cus_rcpt2" }) },
    });
    await handleWebhookEvent("raw", "sig");
    expect((await prisma.subscription.findUnique({ where: { userId: user.id } }))!.status).toBe(
      "ACTIVE",
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("emits a receipt without an invoice link when hosted_invoice_url is absent, defaulting amount/currency", async () => {
    constructEvent.mockReturnValue({
      type: "invoice.paid",
      data: {
        object: fakeInvoice({
          customer: "cus_nolink",
          hosted_invoice_url: null,
          amount_paid: null,
          currency: null,
          created: null,
        }),
      },
    });
    await handleWebhookEvent("raw", "sig");
    const mail = sendEmailMock.mock.calls[0]![0];
    // amount/currency default to 0.00 USD; no invoice link line/anchor present.
    expect(mail.text).toContain("0.00 USD");
    expect(mail.text).not.toContain("View or download your invoice");
    expect(mail.html).not.toContain("href");
  });
});

describe("refundCharge", () => {
  it("throws 503 billing_not_configured when no key", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(refundCharge("ch_1")).rejects.toMatchObject({
      status: 503,
      code: "billing_not_configured",
    });
    expect(createRefund).not.toHaveBeenCalled();
  });

  it("creates a Stripe refund for the charge and returns it", async () => {
    createRefund.mockResolvedValue({ id: "re_1", charge: "ch_1", status: "succeeded" });
    const refund = await refundCharge("ch_1");
    expect(createRefund).toHaveBeenCalledWith({ charge: "ch_1" });
    expect(refund).toMatchObject({ id: "re_1", status: "succeeded" });
  });
});
