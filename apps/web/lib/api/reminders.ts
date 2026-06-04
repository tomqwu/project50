/**
 * Daily reminder service (#121).
 *
 * Finds users with an ACTIVE Project 50 run who have NOT yet completed today's
 * 7/7 (in their run's local timezone) and nudges them with one email. Gated on
 * the email provider: with no RESEND_API_KEY / EMAIL_FROM the whole thing is a
 * logged no-op (see lib/email.ts), so it is safe to wire up before email is
 * configured.
 *
 * ── EMAIL ADDRESS CAVEAT ──────────────────────────────────────────────────
 * The User model has NO email field today (id / handle / displayName, plus
 * OAuth Identity rows that store only provider + providerAccountId — no email).
 * So we cannot yet send to a real inbox. Each recipient is scoped to the user's
 * handle and a PLACEHOLDER address derived from it; `address` is flagged
 * `isPlaceholder: true`. FOLLOW-UP (schema, out of scope here): add
 * `User.email` (and a per-user reminder preference / opt-out) and resolve the
 * real address in `recipientAddress()`. Until then, with real provider env set
 * this would send to a placeholder domain — which is why the service stays
 * gated and is exercised in tests with a mocked provider.
 */
import { prisma } from "@project50/db";
import { localDayKey, PROJECT50_RULE_IDS } from "@project50/core";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { isWithinQuietHours } from "@/lib/api/notification-prefs";
import { logger } from "@/lib/logger";

/** Placeholder domain for derived (non-real) recipient addresses. */
const PLACEHOLDER_DOMAIN = "no-email.project50.invalid";

export interface ReminderRecipient {
  userId: string;
  handle: string;
  displayName: string;
  runId: string;
  /** Today's key in the run's timezone (YYYY-MM-DD). */
  dayKey: string;
  dayNumber: number;
  /** How many of the 7 rules are checked off so far today. */
  completedCount: number;
  /** Recipient email address. Placeholder until User.email exists (see file note). */
  address: string;
  isPlaceholder: boolean;
}

export interface ReminderSummary {
  sent: number;
  skipped: number;
}

/**
 * Resolve the recipient address for a user.
 * No User.email exists yet, so this returns a deterministic placeholder and
 * flags it. Replace with the real address once the schema carries an email.
 */
function recipientAddress(handle: string): { address: string; isPlaceholder: boolean } {
  return { address: `${handle}@${PLACEHOLDER_DOMAIN}`, isPlaceholder: true };
}

/** Day number (1-based) for `dayKey` within a run that started on `startDate`. */
function dayNumberInRun(startDate: string, dayKey: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const day = Date.parse(`${dayKey}T00:00:00Z`);
  return Math.max(1, Math.round((day - start) / 86_400_000) + 1);
}

/**
 * Users who should get a reminder right now: those with an ACTIVE Project 50
 * run whose today's DayStatus is not completed (i.e. not 7/7 yet).
 *
 * "Today" is computed per-run in the run's timezone, so a user is only nudged
 * once their local day is under way and still incomplete.
 */
export async function findUsersNeedingReminder(
  now: Date = new Date(),
): Promise<ReminderRecipient[]> {
  const runs = await prisma.challenge.findMany({
    where: { kind: "PROJECT50", status: "ACTIVE" },
    include: { owner: true, dayStatuses: true },
  });

  const recipients: ReminderRecipient[] = [];
  for (const run of runs) {
    // Respect notification preferences (#122): never nudge a user who has
    // turned reminders off or who is currently within their quiet-hours window.
    if (!run.owner.remindersEnabled) continue;
    if (isWithinQuietHours(run.owner, now)) continue;

    const dayKey = localDayKey(now, run.timezone);
    const today = run.dayStatuses.find((ds) => ds.dayKey === dayKey);
    if (today?.completed) continue; // already 7/7 today → no nudge

    const completedCount = await prisma.ruleCheck.count({
      where: { challengeId: run.id, dayKey, done: true },
    });

    const { address, isPlaceholder } = recipientAddress(run.owner.handle);
    recipients.push({
      userId: run.ownerId,
      handle: run.owner.handle,
      displayName: run.owner.displayName,
      runId: run.id,
      dayKey,
      dayNumber: dayNumberInRun(run.startDate, dayKey),
      completedCount,
      address,
      isPlaceholder,
    });
  }
  return recipients;
}

/** Build the reminder email for one recipient. */
export function buildReminderEmail(r: ReminderRecipient): {
  subject: string;
  html: string;
  text: string;
} {
  const total = PROJECT50_RULE_IDS.length;
  const remaining = total - r.completedCount;
  const subject = `Project 50 — Day ${r.dayNumber}: ${remaining} rule${
    remaining === 1 ? "" : "s"
  } left today`;
  const line =
    r.completedCount === 0
      ? `You haven't logged any of today's ${total} rules yet.`
      : `You've done ${r.completedCount}/${total} of today's rules — ${remaining} to go.`;
  const text = `Hi ${r.displayName},\n\n${line}\nFinish all ${total} before midnight to keep your streak alive.\n\n— Project 50`;
  const html = `<p>Hi ${r.displayName},</p><p>${line}</p><p>Finish all ${total} before midnight to keep your streak alive.</p><p>— Project 50</p>`;
  return { subject, html, text };
}

/**
 * Send a daily reminder to every user who needs one. Gated on email config:
 * when the provider is not configured this logs and returns a zero summary
 * without querying or sending (true no-op).
 *
 * Returns a summary { sent, skipped } where `skipped` counts recipients whose
 * send did not succeed (provider error, etc.).
 */
export async function sendDailyReminders(
  now: Date = new Date(),
): Promise<ReminderSummary> {
  if (!isEmailConfigured()) {
    logger.info("reminders: email not configured; skipping run (no-op)");
    return { sent: 0, skipped: 0 };
  }

  const recipients = await findUsersNeedingReminder(now);
  let sent = 0;
  let skipped = 0;
  for (const r of recipients) {
    const { subject, html, text } = buildReminderEmail(r);
    const result = await sendEmail({ to: r.address, subject, html, text });
    if (result.sent) sent += 1;
    else skipped += 1;
  }
  logger.info("reminders: run complete", { sent, skipped, candidates: recipients.length });
  return { sent, skipped };
}
