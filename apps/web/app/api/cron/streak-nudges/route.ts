/**
 * Streak-at-risk nudge trigger (#123).
 *
 * POST-only endpoint that runs the streak-at-risk batch (sendStreakNudges) and
 * returns its summary. Meant to be called by a scheduler, NOT a browser, so it
 * is protected by the same shared secret as the daily reminder cron:
 *
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Auth model:
 *   - CRON_SECRET unset  → endpoint disabled (503). Nothing can trigger a send.
 *   - CRON_SECRET set    → caller must present the matching Bearer token (401
 *                          otherwise). The send itself is still gated on the
 *                          email provider (RESEND_API_KEY/EMAIL_FROM): with no
 *                          provider configured this returns { sent: 0, skipped: 0 }.
 *
 * ── Scheduling ───────────────────────────────────────────────────────────────
 * Run this more often than the daily reminder (e.g. hourly) so it catches users
 * once their local clock passes the risk hour (default 18:00 local). Each run
 * only nudges runs that are late AND still incomplete in their own timezone.
 *   Vercel Cron (vercel.json):
 *     { "crons": [{ "path": "/api/cron/streak-nudges", "schedule": "0 * * * *" }] }
 *   Generic host scheduler (cron / systemd timer):
 *     curl -fsS -X POST "$APP_BASE_URL/api/cron/streak-nudges" \
 *       -H "Authorization: Bearer ${CRON_SECRET}"
 */
import { sendStreakNudges } from "@/lib/api/reminders";
import { logger } from "@/lib/logger";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.warn("cron/streak-nudges called but CRON_SECRET is not set; refusing");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await sendStreakNudges();
  return Response.json(summary, { status: 200 });
}
