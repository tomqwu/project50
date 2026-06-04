/**
 * Daily reminder trigger (#121).
 *
 * POST-only endpoint that runs the reminder batch (sendDailyReminders) and
 * returns its summary. Meant to be called by a scheduler, NOT a browser, so it
 * is protected by a shared secret:
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
 * ── Scheduling (pick one for your host) ──────────────────────────────────────
 *   Vercel Cron (vercel.json):
 *     { "crons": [{ "path": "/api/cron/reminders", "schedule": "0 12 * * *" }] }
 *     Vercel sends the request with the project's CRON_SECRET as a Bearer token.
 *   GitHub Actions (.github/workflows/reminders.yml):
 *     on: { schedule: [{ cron: "0 12 * * *" }] }
 *     run: curl -fsS -X POST "$APP_BASE_URL/api/cron/reminders" \
 *            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
 *   Generic host scheduler (cron / systemd timer): same curl as above.
 */
import { sendDailyReminders } from "@/lib/api/reminders";
import { logger } from "@/lib/logger";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.warn("cron/reminders called but CRON_SECRET is not set; refusing");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await sendDailyReminders();
  return Response.json(summary, { status: 200 });
}
