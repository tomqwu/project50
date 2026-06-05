import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, cleanup, waitFor } from "@testing-library/react";
import { ReferralClaim } from "./ReferralClaim";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

describe("ReferralClaim", () => {
  it("POSTs to /api/referral/claim once on mount (cookie-driven, empty body)", async () => {
    render(<ReferralClaim />);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/referral/claim",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renders nothing (no visible UI)", () => {
    const { container } = render(<ReferralClaim />);
    expect(container).toBeEmptyDOMElement();
  });

  it("fires only once under StrictMode's double-mount (ref guard)", async () => {
    render(
      <StrictMode>
        <ReferralClaim />
      </StrictMode>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // StrictMode mounts → unmounts → remounts the effect; the ref guard keeps
    // the POST from firing twice.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed claim request (best-effort, never throws)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    // Should not throw during render/effect.
    expect(() => render(<ReferralClaim />)).not.toThrow();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
});
