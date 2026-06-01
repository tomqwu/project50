import { redirect } from "next/navigation";
import { requireUser } from "./session";

/**
 * Checks whether the current request has an authenticated user.
 * Returns the uid on success; calls redirect("/signin") if not.
 * Extracted from the (app) layout so the layout file exports only its
 * default component (Next.js disallows arbitrary layout exports).
 */
export async function requireAuth(): Promise<string> {
  const uid = await requireUser().catch(() => null);
  if (!uid) redirect("/signin");
  return uid;
}
