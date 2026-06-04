// @vitest-environment node
import { describe, beforeEach, it, expect, vi } from "vitest";

// http.ts (imported transitively via the route + billing) pulls in @/lib/session
// → next-auth, which can't load under vitest. Mock it like the other node tests.
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/api/billing", () => ({ handleWebhookEvent: vi.fn() }));

import { handleWebhookEvent } from "@/lib/api/billing";
import { HttpError } from "@/lib/api/http";
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
});

function webhookRequest(body: string, signature?: string) {
  const headers: Record<string, string> = {};
  if (signature !== undefined) headers["stripe-signature"] = signature;
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/billing/webhook", () => {
  it("passes the raw body and signature to handleWebhookEvent", async () => {
    vi.mocked(handleWebhookEvent).mockResolvedValue({ received: true });
    const res = await POST(webhookRequest("RAW_BODY", "t=1,v1=abc"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(handleWebhookEvent).toHaveBeenCalledWith("RAW_BODY", "t=1,v1=abc");
  });

  it("passes null when the signature header is absent", async () => {
    vi.mocked(handleWebhookEvent).mockResolvedValue({ received: true });
    await POST(webhookRequest("{}"));
    expect(handleWebhookEvent).toHaveBeenCalledWith("{}", null);
  });

  it("returns 400 invalid_signature from the handler", async () => {
    vi.mocked(handleWebhookEvent).mockRejectedValue(new HttpError(400, "invalid_signature"));
    const res = await POST(webhookRequest("bad", "sig"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_signature" });
  });

  it("returns 503 when billing is not configured", async () => {
    vi.mocked(handleWebhookEvent).mockRejectedValue(new HttpError(503, "billing_not_configured"));
    const res = await POST(webhookRequest("{}", "sig"));
    expect(res.status).toBe(503);
  });
});
