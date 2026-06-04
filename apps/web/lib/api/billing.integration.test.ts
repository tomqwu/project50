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
const { createSession, constructEvent, createPortal, stripeCtor } = vi.hoisted(() => {
  const createSession = vi.fn();
  const constructEvent = vi.fn();
  const createPortal = vi.fn();
  const stripeCtor = vi.fn(() => ({
    checkout: { sessions: { create: createSession } },
    billingPortal: { sessions: { create: createPortal } },
    webhooks: { constructEvent },
  }));
  return { createSession, constructEvent, createPortal, stripeCtor };
});
vi.mock("stripe", () => ({ default: stripeCtor }));

import {
  isBillingConfigured,
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
} from "./billing";

const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  // Default: configured. Individual tests override as needed.
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.APP_BASE_URL = "https://app.test";
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
    constructEvent.mockReturnValue({ type: "invoice.paid", data: {} });
    await expect(handleWebhookEvent("{}", "sig")).resolves.toEqual({
      received: true,
    });
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
});
