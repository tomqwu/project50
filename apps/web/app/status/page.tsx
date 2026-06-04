import { prisma } from "@project50/db";
import { checkStorage } from "@/lib/storage";
import {
  StatusView,
  type ComponentStatus,
  type StatusLevel,
} from "./_components/StatusView";

/**
 * Public status page. Lives OUTSIDE the `(app)` auth group so it is reachable
 * without a session.
 *
 * It reuses the same readiness signals as `/api/ready`: a trivial Postgres
 * `SELECT 1` and `checkStorage()` (object-storage HEAD). Health is sampled on
 * every request — never cached — so the page always reflects current state.
 *
 * Alternative: a hosted provider such as Atlassian Statuspage or Better Stack
 * could front this with incident history and subscriptions. We ship the
 * self-hosted page here to keep status backed by our own live checks with no
 * extra dependency.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Status — project50",
  description: "Real-time health of project50 components.",
};

/** Database readiness: true when a trivial query succeeds. Never throws. */
async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Map a boolean reachability probe to a component health level. */
function level(up: boolean): StatusLevel {
  return up ? "operational" : "down";
}

/**
 * Derive the aggregate health from per-component levels.
 *
 * - operational: every component is up.
 * - down: every dependency we actively probe (database, storage) is down. The
 *   web tier is necessarily up while this code runs, so it is excluded from the
 *   "everything is down" test — otherwise a total dependency outage could only
 *   ever show as "degraded".
 * - degraded: anything in between.
 */
function overallLevel(
  components: ComponentStatus[],
  dependencies: StatusLevel[],
): StatusLevel {
  if (components.every((c) => c.status === "operational")) return "operational";
  if (dependencies.every((d) => d === "down")) return "down";
  return "degraded";
}

export default async function StatusPage() {
  // The web tier is "up since the page rendered" — if this code runs, it serves.
  const checkedAt = new Date().toISOString();
  const [database, storage] = await Promise.all([
    checkDatabase(),
    checkStorage(),
  ]);

  const databaseLevel = level(database);
  const storageLevel = level(storage);
  const components: ComponentStatus[] = [
    { name: "Web", status: "operational", checkedAt },
    { name: "Database", status: databaseLevel, checkedAt },
    { name: "Object storage", status: storageLevel, checkedAt },
  ];

  return (
    <StatusView
      overall={overallLevel(components, [databaseLevel, storageLevel])}
      components={components}
    />
  );
}
