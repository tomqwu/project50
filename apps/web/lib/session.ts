import { auth } from "@/auth";
import { headers } from "next/headers";
import { readBearerUser } from "./mobile-session";

export class UnauthorizedError extends Error {}

/**
 * Returns the authenticated user id, or throws UnauthorizedError.
 *
 * Web requests authenticate via the NextAuth session cookie (`auth()`).
 * Mobile requests authenticate via an `Authorization: Bearer <jwt>` header,
 * decoded by `readBearerUser`. The cookie path takes precedence.
 */
export async function requireUser(): Promise<string> {
  const session = await auth();
  const cookieId = (session?.user as { id?: string } | undefined)?.id;
  if (cookieId) return cookieId;

  const headerList = await headers();
  const bearerId = await readBearerUser(headerList.get("authorization"));
  if (bearerId) return bearerId;

  throw new UnauthorizedError("unauthenticated");
}
