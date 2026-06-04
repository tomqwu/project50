"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";
import { HttpError } from "@/lib/api/http";
import { updateAccount, deleteAccount, type Account } from "@/lib/api/account";
import {
  updateNotificationPrefs,
  type NotificationPrefs,
  type NotificationPrefsInput,
} from "@/lib/api/notification-prefs";
import { withActionLogging } from "@/lib/log-action";

export type UpdateAccountResult =
  | { ok: true; account: Account }
  | { ok: false; error: string };

/**
 * Server action invoked by the settings form. Updates the signed-in user's
 * profile and returns a discriminated result so the client can render success
 * or validation errors without throwing across the action boundary.
 */
export const updateAccountAction = withActionLogging(
  "updateAccountAction",
  async (input: {
    displayName?: string;
    handle?: string;
  }): Promise<UpdateAccountResult> => {
    const uid = await requireUser();
    try {
      const account = await updateAccount(uid, input);
      revalidatePath("/settings");
      return { ok: true, account };
    } catch (err) {
      // Expected validation failure: returned (not thrown), so it is not logged
      // as an error. Only genuinely unexpected throws reach withActionLogging.
      if (err instanceof HttpError) {
        return { ok: false, error: err.code };
      }
      throw err;
    }
  },
);

export type UpdateNotificationPrefsResult =
  | { ok: true; prefs: NotificationPrefs }
  | { ok: false; error: string };

/**
 * Server action invoked by the Notifications settings section. Updates the
 * signed-in user's reminder/quiet-hours preferences and returns a discriminated
 * result so the client can render success or a validation error without
 * throwing across the action boundary.
 */
export const updateNotificationPrefsAction = withActionLogging(
  "updateNotificationPrefsAction",
  async (
    input: NotificationPrefsInput,
  ): Promise<UpdateNotificationPrefsResult> => {
    const uid = await requireUser();
    try {
      const prefs = await updateNotificationPrefs(uid, input);
      revalidatePath("/settings");
      return { ok: true, prefs };
    } catch (err) {
      if (err instanceof HttpError) {
        return { ok: false, error: err.code };
      }
      throw err;
    }
  },
);

/**
 * Server action invoked by the danger-zone delete control. Permanently deletes
 * the signed-in user (cascading all their data) and then signs them out,
 * redirecting to /signin. If deletion fails the error propagates and sign-out
 * is skipped, so the user is not logged out of an account that still exists.
 */
export const deleteAccountAction = withActionLogging(
  "deleteAccountAction",
  async (): Promise<void> => {
    const uid = await requireUser();
    await deleteAccount(uid);
    await signOut({ redirectTo: "/signin" });
  },
);
