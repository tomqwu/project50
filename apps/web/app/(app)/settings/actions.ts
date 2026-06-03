"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";
import { HttpError } from "@/lib/api/http";
import { updateAccount, deleteAccount, type Account } from "@/lib/api/account";

export type UpdateAccountResult =
  | { ok: true; account: Account }
  | { ok: false; error: string };

/**
 * Server action invoked by the settings form. Updates the signed-in user's
 * profile and returns a discriminated result so the client can render success
 * or validation errors without throwing across the action boundary.
 */
export async function updateAccountAction(input: {
  displayName?: string;
  handle?: string;
}): Promise<UpdateAccountResult> {
  const uid = await requireUser();
  try {
    const account = await updateAccount(uid, input);
    revalidatePath("/settings");
    return { ok: true, account };
  } catch (err) {
    if (err instanceof HttpError) {
      return { ok: false, error: err.code };
    }
    throw err;
  }
}

/**
 * Server action invoked by the danger-zone delete control. Permanently deletes
 * the signed-in user (cascading all their data) and then signs them out,
 * redirecting to /signin. If deletion fails the error propagates and sign-out
 * is skipped, so the user is not logged out of an account that still exists.
 */
export async function deleteAccountAction(): Promise<void> {
  const uid = await requireUser();
  await deleteAccount(uid);
  await signOut({ redirectTo: "/signin" });
}
