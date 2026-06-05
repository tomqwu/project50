import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./api/referral", () => ({ recordReferral: vi.fn() }));

import { recordReferral } from "./api/referral";
import { claimReferralCode } from "./referral-claim-server";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("claimReferralCode", () => {
  it("records a valid code for the user and returns true", async () => {
    vi.mocked(recordReferral).mockResolvedValue(true);
    const result = await claimReferralCode("ABCD2345", "user-1");
    expect(recordReferral).toHaveBeenCalledWith("ABCD2345", "user-1");
    expect(result).toBe(true);
  });

  it("returns false (no-op) when recordReferral declines (self / already / unknown)", async () => {
    vi.mocked(recordReferral).mockResolvedValue(false);
    const result = await claimReferralCode("ABCD2345", "user-1");
    expect(result).toBe(false);
  });

  it("does not call recordReferral for an undefined/empty cookie value", async () => {
    expect(await claimReferralCode(undefined, "user-1")).toBe(false);
    expect(await claimReferralCode("", "user-1")).toBe(false);
    expect(await claimReferralCode("   ", "user-1")).toBe(false);
    expect(recordReferral).not.toHaveBeenCalled();
  });

  it("does not call recordReferral for an invalid/garbage cookie value", async () => {
    expect(await claimReferralCode("../evil", "user-1")).toBe(false);
    expect(recordReferral).not.toHaveBeenCalled();
  });

  it("trims the code before recording", async () => {
    vi.mocked(recordReferral).mockResolvedValue(true);
    await claimReferralCode("  ABCD2345  ", "user-1");
    expect(recordReferral).toHaveBeenCalledWith("ABCD2345", "user-1");
  });
});
