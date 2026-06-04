/**
 * Daily reminders + streak-at-risk nudges (#121, #123) over a channel-agnostic
 * dispatch (#120).
 *
 * Two services live here, both built on the same selection + delivery shape:
 *   - Daily reminder: every ACTIVE Project 50 run that hasn't hit 7/7 today gets
 *     one nudge to finish the day.
 *   - Streak-at-risk: a subset — runs that are incomplete AND it's "late" in the
 *     run's local day (past a configurable hour, default 18:00) — get a sharper
 *     "your streak is at risk" message.
 *
 * Delivery goes through lib/api/notifications (the {@link dispatch} fan-out), so
 * email is just one channel and push can be added later without touching this
 * file. Sends stay gated on the email provider (lib/email): with no
 * RESEND_API_KEY / EMAIL_FROM the whole batch is a logged no-op, so this is safe
 * to wire up before email is configured.
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
import { localDayKey, safeTimeZone, PROJECT50_RULE_IDS } from "@project50/core";
import { isEmailConfigured } from "@/lib/email";
import { isWithinQuietHours } from "@/lib/api/notification-prefs";
import { dispatch, type NotificationRecipient } from "@/lib/api/notifications";
import { logger } from "@/lib/logger";

/** Placeholder domain for derived (non-real) recipient addresses. */
const PLACEHOLDER_DOMAIN = "no-email.project50.invalid";

/** Default local hour (0-23) at/after which an incomplete day is "at risk". */
export const DEFAULT_STREAK_RISK_HOUR = 18;

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

/** The local hour (0-23) that `instant` falls on in `timeZone`. */
function localHour(instant: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    // safeTimeZone degrades a blank/invalid stored zone to UTC so a single bad
    // run can't throw and abort streak-at-risk selection for ALL runs.
    timeZone: safeTimeZone(timeZone),
    hour: "2-digit",
    hour12: false,
  }).format(instant);
  // "24" can appear for midnight in some environments; normalize to 0.
  return Number(hour) % 24;
}

/** Project a run + its owner into a {@link ReminderRecipient}. */
function toRecipient(
  run: {
    id: string;
    ownerId: string;
    startDate: string;
    owner: { handle: string; displayName: string };
  },
  dayKey: string,
  completedCount: number,
): ReminderRecipient {
  const { address, isPlaceholder } = recipientAddress(run.owner.handle);
  return {
    userId: run.ownerId,
    handle: run.owner.handle,
    displayName: run.owner.displayName,
    runId: run.id,
    dayKey,
    dayNumber: dayNumberInRun(run.startDate, dayKey),
    completedCount,
    address,
    isPlaceholder,
  };
}

/** A {@link ReminderRecipient} as a transport-neutral notification target. */
function asNotificationRecipient(r: ReminderRecipient): NotificationRecipient {
  return {
    userId: r.userId,
    displayName: r.displayName,
    address: r.address,
    isPlaceholder: r.isPlaceholder,
  };
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

    recipients.push(toRecipient(run, dayKey, completedCount));
  }
  return recipients;
}

/**
 * Users whose streak is at risk RIGHT NOW (#123): an ACTIVE Project 50 run that
 * is still incomplete today AND whose local clock has passed `riskHour` (default
 * {@link DEFAULT_STREAK_RISK_HOUR}). This is a sharper, time-of-day-gated subset
 * of {@link findUsersNeedingReminder} — late in the day with the day not done
 * means the streak breaks at midnight unless they act.
 *
 * Lateness is evaluated in each run's own timezone, and the same notification
 * preferences (reminders off, quiet hours) are respected.
 */
export async function findStreakAtRiskUsers(
  now: Date = new Date(),
  riskHour: number = DEFAULT_STREAK_RISK_HOUR,
): Promise<ReminderRecipient[]> {
  const runs = await prisma.challenge.findMany({
    where: { kind: "PROJECT50", status: "ACTIVE" },
    include: { owner: true, dayStatuses: true },
  });

  const recipients: ReminderRecipient[] = [];
  for (const run of runs) {
    if (!run.owner.remindersEnabled) continue;
    if (isWithinQuietHours(run.owner, now)) continue;

    // Only "at risk" once the run's local day is late.
    if (localHour(now, run.timezone) < riskHour) continue;

    const dayKey = localDayKey(now, run.timezone);
    const today = run.dayStatuses.find((ds) => ds.dayKey === dayKey);
    if (today?.completed) continue; // already 7/7 → not at risk

    const completedCount = await prisma.ruleCheck.count({
      where: { challengeId: run.id, dayKey, done: true },
    });

    recipients.push(toRecipient(run, dayKey, completedCount));
  }
  return recipients;
}

/** Build the daily reminder email for one recipient. */
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
 * Build the streak-at-risk nudge for one recipient. Deliberately distinct from
 * the daily reminder: the subject and body lead with the streak being in danger
 * and the midnight deadline, to create urgency.
 */
export function buildStreakNudgeEmail(r: ReminderRecipient): {
  subject: string;
  html: string;
  text: string;
} {
  const total = PROJECT50_RULE_IDS.length;
  const remaining = total - r.completedCount;
  const subject = `⚠️ Your Project 50 streak is at risk — Day ${r.dayNumber}: ${remaining} rule${
    remaining === 1 ? "" : "s"
  } left`;
  const line = `It's getting late and you're at ${r.completedCount}/${total} today — ${remaining} rule${
    remaining === 1 ? "" : "s"
  } still to go.`;
  const text = `Hi ${r.displayName},\n\nYour streak is at risk. ${line}\nFinish all ${total} before midnight or the streak resets to Day 1.\n\n— Project 50`;
  const html = `<p>Hi ${r.displayName},</p><p><strong>Your streak is at risk.</strong> ${line}</p><p>Finish all ${total} before midnight or the streak resets to Day 1.</p><p>— Project 50</p>`;
  return { subject, html, text };
}

/**
 * Deliver a batch of recipients with a given message builder over the channel
 * dispatch. Gated on the email provider: when it isn't configured this logs and
 * returns a zero summary without querying recipients (true no-op). Each
 * recipient counts as `sent` when at least one channel delivers, else `skipped`.
 */
async function deliverBatch(
  label: string,
  loadRecipients: () => Promise<ReminderRecipient[]>,
  build: (r: ReminderRecipient) => { subject: string; html: string; text: string },
): Promise<ReminderSummary> {
  if (!isEmailConfigured()) {
    logger.info(`${label}: email not configured; skipping run (no-op)`);
    return { sent: 0, skipped: 0 };
  }

  const recipients = await loadRecipients();
  let sent = 0;
  let skipped = 0;
  for (const r of recipients) {
    const delivered = await dispatch(asNotificationRecipient(r), build(r));
    if (delivered) sent += 1;
    else skipped += 1;
  }
  logger.info(`${label}: run complete`, { sent, skipped, candidates: recipients.length });
  return { sent, skipped };
}

/**
 * Send a daily reminder to every user who needs one, via the channel dispatch.
 * Returns a summary { sent, skipped }.
 */
export async function sendDailyReminders(now: Date = new Date()): Promise<ReminderSummary> {
  return deliverBatch("reminders", () => findUsersNeedingReminder(now), buildReminderEmail);
}

/**
 * Send a streak-at-risk nudge (#123) to every user whose run is incomplete and
 * late in their local day, via the channel dispatch. Returns { sent, skipped }.
 */
export async function sendStreakNudges(
  now: Date = new Date(),
  riskHour: number = DEFAULT_STREAK_RISK_HOUR,
): Promise<ReminderSummary> {
  return deliverBatch(
    "streak-nudges",
    () => findStreakAtRiskUsers(now, riskHour),
    buildStreakNudgeEmail,
  );
}
