import { requireUser } from "@/lib/session";
import { handleRoute, unprocessable } from "@/lib/api/http";
import { logger } from "@/lib/logger";

const log = logger.child({ scope: "push.register" });

/** Platforms we accept push tokens for (Expo abstracts APNs #91 / FCM #109). */
const PLATFORMS = ["ios", "android"] as const;
type Platform = (typeof PLATFORMS)[number];

interface RegisterBody {
  token?: unknown;
  platform?: unknown;
}

function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

/**
 * POST /api/push/register — store an Expo push token for the signed-in user so
 * the backend can deliver daily reminders.
 *
 * Auth: cookie session (web) or `Authorization: Bearer <jwt>` (mobile), via
 * {@link requireUser}.
 *
 * Body: `{ token: string, platform: "ios" | "android" }`.
 *
 * PERSISTENCE: intentionally not yet written to the database. A PushToken model
 * (or a field on the user) is owned by a separate schema change this wave; to
 * avoid a migration conflict we validate + log the token and return 200. The
 * scheduled-reminder sender will read persisted tokens once the model lands.
 * FOLLOW-UP: upsert (userId, token, platform) into a PushToken table.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();

    const body = (await req.json().catch(() => ({}))) as RegisterBody;
    const { token, platform } = body;

    if (typeof token !== "string" || token.length === 0) {
      unprocessable("invalid_token");
    }
    if (!isPlatform(platform)) {
      unprocessable("invalid_platform");
    }

    // TODO(persistence): upsert this token for `uid`. For now, accept + log so
    // the mobile registration flow is end-to-end without a schema migration.
    log.info("push token registered", { userId: uid, platform });

    return Response.json({ ok: true });
  });
}
