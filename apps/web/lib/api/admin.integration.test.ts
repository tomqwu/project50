// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma, resetDb, createUser } from "../../test/db";
import { requireAdmin, listUsers, listReports } from "./admin";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("requireAdmin", () => {
  it("returns the admin user when isAdmin is true", async () => {
    const admin = await createUser({ handle: "boss", isAdmin: true });
    const user = await requireAdmin(admin.id);
    expect(user.id).toBe(admin.id);
    expect(user.isAdmin).toBe(true);
  });

  it("throws 404 when the user is not an admin", async () => {
    const alice = await createUser({ handle: "alice" });
    await expect(requireAdmin(alice.id)).rejects.toMatchObject({
      status: 404,
      code: "ADMIN_FORBIDDEN",
    });
  });

  it("throws 404 when the user does not exist", async () => {
    await expect(requireAdmin("missing")).rejects.toMatchObject({
      status: 404,
      code: "ADMIN_FORBIDDEN",
    });
  });
});

describe("listUsers", () => {
  it("returns all users with admin-relevant fields, newest first", async () => {
    const a = await createUser({ handle: "alice", displayName: "Alice" });
    const b = await createUser({ handle: "bob", isAdmin: true });

    const users = await listUsers();

    expect(users).toHaveLength(2);
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    expect(byId[a.id]).toMatchObject({
      id: a.id,
      handle: "alice",
      displayName: "Alice",
      isAdmin: false,
    });
    expect(byId[b.id]).toMatchObject({
      id: b.id,
      handle: "bob",
      isAdmin: true,
    });
  });

  it("returns an empty array when there are no users", async () => {
    expect(await listUsers()).toEqual([]);
  });
});

describe("listReports", () => {
  it("returns recent reports newest-first with reporter handle", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const first = await prisma.report.create({
      data: {
        reporterId: alice.id,
        targetType: "USER",
        targetId: bob.id,
        reason: "spam",
      },
    });
    const second = await prisma.report.create({
      data: {
        reporterId: bob.id,
        targetType: "ACTIVITY",
        targetId: "act-1",
        reason: "abuse",
      },
    });

    const reports = await listReports();

    expect(reports).toHaveLength(2);
    // newest first
    expect(reports[0]!.id).toBe(second.id);
    expect(reports[1]!.id).toBe(first.id);
    expect(reports[0]).toMatchObject({
      targetType: "ACTIVITY",
      targetId: "act-1",
      reason: "abuse",
      reporterHandle: "bob",
    });
    expect(reports[1]!.reporterHandle).toBe("alice");
  });

  it("returns an empty array when there are no reports", async () => {
    expect(await listReports()).toEqual([]);
  });
});
