import { prisma } from "@project50/db";
import { notFound, unprocessable } from "./http";

/** Account fields a user can view/edit. */
export interface Account {
  handle: string;
  displayName: string;
}

/** Allowed characters/length for a handle: 3–30 of [a-z0-9_], case-insensitive. */
const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/i;

/** Return the user's editable account fields. Throws 404 if no such user. */
export async function getAccount(uid: string): Promise<Account> {
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { handle: true, displayName: true },
  });
  if (!user) notFound("ACCOUNT_NOT_FOUND");
  return { handle: user.handle, displayName: user.displayName };
}

/**
 * Update the user's profile. Both fields are optional; provided values are
 * trimmed. A provided handle must be non-empty, match {@link HANDLE_PATTERN},
 * and not be taken by a different user. A provided displayName must be
 * non-empty after trimming. Returns the resulting { handle, displayName }.
 */
export async function updateAccount(
  uid: string,
  input: { displayName?: string; handle?: string },
): Promise<Account> {
  const data: { displayName?: string; handle?: string } = {};

  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim();
    if (displayName === "") unprocessable("invalid_display_name");
    data.displayName = displayName;
  }

  if (input.handle !== undefined) {
    const handle = input.handle.trim();
    if (!HANDLE_PATTERN.test(handle)) unprocessable("invalid_handle");

    const existing = await prisma.user.findUnique({
      where: { handle },
      select: { id: true },
    });
    if (existing && existing.id !== uid) unprocessable("handle_taken");

    data.handle = handle;
  }

  if (Object.keys(data).length === 0) {
    return getAccount(uid);
  }

  const updated = await prisma.user.update({
    where: { id: uid },
    data,
    select: { handle: true, displayName: true },
  });
  return { handle: updated.handle, displayName: updated.displayName };
}

/**
 * Permanently delete the user and all of their data. Prisma relations declare
 * `onDelete: Cascade`, so deleting the User row cascades to their identities,
 * challenges (and each challenge's activities, media, day statuses, milestones,
 * recaps, rule checks, reactions), first-party activities/reactions, and follow
 * edges in both directions. Throws if no such user exists.
 */
export async function deleteAccount(uid: string): Promise<void> {
  await prisma.user.delete({ where: { id: uid } });
}
