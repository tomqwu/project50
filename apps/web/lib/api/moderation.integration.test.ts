// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma, resetDb, createUser } from "../../test/db";
import { blockUser, unblockUser, isBlocked, reportTarget } from "./moderation";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("blockUser", () => {
  it("creates a block edge", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await blockUser(alice.id, bob.id);

    const edge = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: alice.id, blockedId: bob.id } },
    });
    expect(edge).toBeTruthy();
    expect(edge!.blockerId).toBe(alice.id);
    expect(edge!.blockedId).toBe(bob.id);
  });

  it("is idempotent (double block does not throw)", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await blockUser(alice.id, bob.id);
    await blockUser(alice.id, bob.id); // should not throw

    const count = await prisma.block.count({
      where: { blockerId: alice.id, blockedId: bob.id },
    });
    expect(count).toBe(1);
  });

  it("throws 422 cannot_block_self", async () => {
    const alice = await createUser({ handle: "alice" });
    await expect(blockUser(alice.id, alice.id)).rejects.toMatchObject({
      status: 422,
      code: "cannot_block_self",
    });
  });
});

describe("unblockUser", () => {
  it("removes a block edge", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await blockUser(alice.id, bob.id);
    await unblockUser(alice.id, bob.id);

    const edge = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: alice.id, blockedId: bob.id } },
    });
    expect(edge).toBeNull();
  });

  it("is idempotent when no edge exists", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    await expect(unblockUser(alice.id, bob.id)).resolves.toBeUndefined();
  });
});

describe("isBlocked", () => {
  it("returns true when a block edge exists", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    await blockUser(alice.id, bob.id);
    expect(await isBlocked(alice.id, bob.id)).toBe(true);
  });

  it("returns false when no block edge exists", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    expect(await isBlocked(alice.id, bob.id)).toBe(false);
  });
});

describe("reportTarget", () => {
  it("creates a USER report", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    const report = await reportTarget(alice.id, {
      targetType: "USER",
      targetId: bob.id,
      reason: "spam",
    });

    expect(report.reporterId).toBe(alice.id);
    expect(report.targetType).toBe("USER");
    expect(report.targetId).toBe(bob.id);
    expect(report.reason).toBe("spam");
  });

  it("creates an ACTIVITY report", async () => {
    const alice = await createUser({ handle: "alice" });

    const report = await reportTarget(alice.id, {
      targetType: "ACTIVITY",
      targetId: "act-1",
      reason: "abuse",
    });

    expect(report.targetType).toBe("ACTIVITY");
    expect(report.targetId).toBe("act-1");
  });

  it("trims the reason before storing", async () => {
    const alice = await createUser({ handle: "alice" });
    const report = await reportTarget(alice.id, {
      targetType: "USER",
      targetId: "u-1",
      reason: "  harassment  ",
    });
    expect(report.reason).toBe("harassment");
  });

  it("throws 422 invalid_target_type for an unknown targetType", async () => {
    const alice = await createUser({ handle: "alice" });
    await expect(
      reportTarget(alice.id, {
        // @ts-expect-error testing invalid input
        targetType: "COMMENT",
        targetId: "x",
        reason: "spam",
      }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_target_type" });
  });

  it("throws 422 reason_required for an empty reason", async () => {
    const alice = await createUser({ handle: "alice" });
    await expect(
      reportTarget(alice.id, {
        targetType: "USER",
        targetId: "x",
        reason: "   ",
      }),
    ).rejects.toMatchObject({ status: 422, code: "reason_required" });
  });
});
