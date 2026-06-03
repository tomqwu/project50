// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "@/test/db";
import { startProject50, getProject50State } from "./project50";

beforeEach(resetDb);
afterAll(async () => { await prisma.$disconnect(); });

async function makeUser() {
  return prisma.user.create({ data: { handle: "u", displayName: "U" } });
}
const NOW = new Date("2026-06-02T12:00:00Z");

describe("getProject50State", () => {
  it("returns NONE when the user has no Project 50 run", async () => {
    const u = await makeUser();
    expect((await getProject50State(u.id, NOW)).status).toBe("NONE");
  });

  it("startProject50 creates an ACTIVE run starting today; state is ACTIVE Day 1 with 0/7", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    const state = await getProject50State(u.id, NOW);
    expect(state.status).toBe("ACTIVE");
    expect(state.today?.dayNumber).toBe(1);
    expect(state.today?.completedCount).toBe(0);
    expect(state.today?.checks).toEqual([false, false, false, false, false, false, false]);
  });
});
