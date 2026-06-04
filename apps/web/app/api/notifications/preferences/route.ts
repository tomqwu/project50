import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import {
  getNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefsInput,
} from "@/lib/api/notification-prefs";

/** GET /api/notifications/preferences — the signed-in user's prefs. */
export async function GET() {
  return handleRoute(async () => {
    const uid = await requireUser();
    return Response.json(await getNotificationPrefs(uid));
  });
}

/**
 * PATCH /api/notifications/preferences — partial update of the signed-in user's
 * notification preferences. Only the provided fields change; hours are validated
 * by {@link updateNotificationPrefs} (422 invalid_quiet_hours on bad input).
 */
export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const body = (await req.json()) as NotificationPrefsInput;
    const patch: NotificationPrefsInput = {};
    if (body.remindersEnabled !== undefined) {
      patch.remindersEnabled = body.remindersEnabled;
    }
    if (body.quietHoursStart !== undefined) {
      patch.quietHoursStart = body.quietHoursStart;
    }
    if (body.quietHoursEnd !== undefined) {
      patch.quietHoursEnd = body.quietHoursEnd;
    }
    return Response.json(await updateNotificationPrefs(uid, patch));
  });
}
