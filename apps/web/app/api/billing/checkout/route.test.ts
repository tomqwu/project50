// @vitest-environment node
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/api/billing", () => ({ createCheckoutSession: vi.fn() }));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { createCheckoutSession } from "@/lib/api/billing";
import { HttpError } from "@/lib/api/http";
import { POST } from "./route";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function postRequest(body?: unknown) {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/billing/checkout", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("nope"));
    const res = await POST(postRequest({ priceId: "price_1" }));
    expect(res.status).toBe(401);
  });

  it("returns the checkout url for the request priceId", async () => {
    vi.mocked(requireUser).mockResolvedValue("user-1");
    vi.mocked(createCheckoutSession).mockResolvedValue("https://pay/x");
    const res = await POST(postRequest({ priceId: "price_req" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://pay/x" });
    expect(createCheckoutSession).toHaveBeenCalledWith("user-1", "price_req");
  });

  it("falls back to STRIPE_PRICE_ID when body omits priceId", async () => {
    process.env.STRIPE_PRICE_ID = "price_env";
    vi.mocked(requireUser).mockResolvedValue("user-2");
    vi.mocked(createCheckoutSession).mockResolvedValue("https://pay/y");
    const res = await POST(postRequest({}));
    expect(res.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalledWith("user-2", "price_env");
  });

  it("tolerates a missing/non-JSON body and uses the env price", async () => {
    process.env.STRIPE_PRICE_ID = "price_env";
    vi.mocked(requireUser).mockResolvedValue("user-2b");
    vi.mocked(createCheckoutSession).mockResolvedValue("https://pay/z");
    const res = await POST(postRequest());
    expect(res.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalledWith("user-2b", "price_env");
  });

  it("returns 422 when no priceId is available", async () => {
    delete process.env.STRIPE_PRICE_ID;
    vi.mocked(requireUser).mockResolvedValue("user-3");
    const res = await POST(postRequest({}));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "missing_price_id" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("surfaces 503 when billing is not configured", async () => {
    vi.mocked(requireUser).mockResolvedValue("user-4");
    vi.mocked(createCheckoutSession).mockRejectedValue(
      new HttpError(503, "billing_not_configured"),
    );
    const res = await POST(postRequest({ priceId: "price_1" }));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "billing_not_configured",
    });
  });
});
