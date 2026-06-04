/**
 * Notification preferences (#122).
 *
 * A user can turn email reminders on/off and set an optional quiet-hours window
 * (local hours 0-23) during which no reminder is sent. The window may wrap past
 * midnight (e.g. start 22, end 7 means 22:00-06:59 is quiet). The reminder
 * service consults {@link isWithinQuietHours} to stay silent during that window.
 */
import { prisma } from "@project50/db";
import { notFound, unprocessable } from "./http";

/** A user's notification preferences. */
export interface NotificationPrefs {
  remindersEnabled: boolean;
  /** Quiet-hours start hour (0-23, local) or null if no window. */
  quietHoursStart: number | null;
  /** Quiet-hours end hour (0-23, local, exclusive) or null if no window. */
  quietHoursEnd: number | null;
}

/** Fields accepted by {@link updateNotificationPrefs}; all optional. */
export interface NotificationPrefsInput {
  remindersEnabled?: boolean;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
}

/** True when `h` is an integer hour in [0, 23]. */
function isValidHour(h: number): boolean {
  return Number.isInteger(h) && h >= 0 && h <= 23;
}

/** Return the signed-in user's notification preferences. Throws 404 if absent. */
export async function getNotificationPrefs(
  uid: string,
): Promise<NotificationPrefs> {
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      remindersEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  });
  if (!user) notFound("ACCOUNT_NOT_FOUND");
  return {
    remindersEnabled: user.remindersEnabled,
    quietHoursStart: user.quietHoursStart,
    quietHoursEnd: user.quietHoursEnd,
  };
}

/**
 * Update the user's notification preferences. Every field is optional; only the
 * provided ones change. A provided quiet-hours bound must be either null (clear
 * it) or an integer hour in [0, 23] — otherwise a 422 `invalid_quiet_hours` is
 * thrown. Returns the resulting preferences.
 */
export async function updateNotificationPrefs(
  uid: string,
  input: NotificationPrefsInput,
): Promise<NotificationPrefs> {
  const data: NotificationPrefsInput = {};

  if (input.remindersEnabled !== undefined) {
    data.remindersEnabled = input.remindersEnabled;
  }
  if (input.quietHoursStart !== undefined) {
    if (input.quietHoursStart !== null && !isValidHour(input.quietHoursStart)) {
      unprocessable("invalid_quiet_hours");
    }
    data.quietHoursStart = input.quietHoursStart;
  }
  if (input.quietHoursEnd !== undefined) {
    if (input.quietHoursEnd !== null && !isValidHour(input.quietHoursEnd)) {
      unprocessable("invalid_quiet_hours");
    }
    data.quietHoursEnd = input.quietHoursEnd;
  }

  if (Object.keys(data).length === 0) {
    return getNotificationPrefs(uid);
  }

  const updated = await prisma.user.update({
    where: { id: uid },
    data,
    select: {
      remindersEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  });
  return {
    remindersEnabled: updated.remindersEnabled,
    quietHoursStart: updated.quietHoursStart,
    quietHoursEnd: updated.quietHoursEnd,
  };
}

/**
 * Whether `now`'s local hour falls inside the user's quiet-hours window.
 *
 * The window is [start, end) on a 24h clock and may wrap past midnight:
 *   - start < end  → quiet when start <= hour < end (e.g. 1..6)
 *   - start > end  → quiet when hour >= start OR hour < end (e.g. 22..7)
 *   - start == end → empty window, never quiet
 * Returns false when either bound is null (no window configured).
 *
 * `now` is read via its local hour (`getHours`), so quiet hours are evaluated in
 * the host/process timezone of whoever calls it.
 */
export function isWithinQuietHours(
  prefs: Pick<NotificationPrefs, "quietHoursStart" | "quietHoursEnd">,
  now: Date,
): boolean {
  const { quietHoursStart: start, quietHoursEnd: end } = prefs;
  if (start === null || end === null) return false;
  if (start === end) return false;
  const hour = now.getHours();
  if (start < end) return hour >= start && hour < end;
  // Wrap-around window (e.g. 22 -> 7).
  return hour >= start || hour < end;
}
