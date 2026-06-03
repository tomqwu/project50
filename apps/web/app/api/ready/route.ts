import { prisma } from "@project50/db";
import { checkStorage } from "@/lib/storage";

/** Database readiness: true when a trivial query succeeds. Never throws. */
async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Readiness probe — verifies the app's hard dependencies (Postgres + object
 * storage) are reachable. Returns 200 when ready, 503 otherwise, with a
 * per-dependency breakdown so a host healthcheck (or a human) can see which
 * dependency is down.
 *
 * Distinct from `/api/health`, which is a cheap liveness check that must stay
 * dependency-free (a liveness probe failing would trigger a restart, which
 * can't fix an unreachable database).
 */
export async function GET(): Promise<Response> {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const ready = database && storage;
  return Response.json(
    { status: ready ? "ready" : "not_ready", checks: { database, storage } },
    { status: ready ? 200 : 503 },
  );
}
