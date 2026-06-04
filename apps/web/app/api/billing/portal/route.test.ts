// @vitest-environment node
import { describe, beforeEach, it, expect, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/api/billing", () => ({ createPortalSession: vi.fn() }));

import { requireUser, UnauthorizedError } from "@/lib/session";
import { createPortalSession } from "@/lib/api/billing";
import { HttpError } from "@/lib/api/http";
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/billing/portal", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError("nope"));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it("returns the portal url for the signed-in user", async () => {
    vi.mocked(requireUser).mockResolvedValue("user-1");
    vi.mocked(createPortalSession).mockResolvedValue("https://billing/portal");
    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://billing/portal" });
    expect(createPortalSession).toHaveBeenCalledWith("user-1");
  });

  it("surfaces 503 when billing is not configured", async () => {
    vi.mocked(requireUser).mockResolvedValue("user-2");
    vi.mocked(createPortalSession).mockRejectedValue(
      new HttpError(503, "billing_not_configured"),
    );
    const res = await POST();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "billing_not_configured" });
  });

  it("surfaces 409 when the user has no billing customer", async () => {
    vi.mocked(requireUser).mockResolvedValue("user-3");
    vi.mocked(createPortalSession).mockRejectedValue(
      new HttpError(409, "no_billing_customer"),
    );
    const res = await POST();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "no_billing_customer" });
  });
});
