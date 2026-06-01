import { auth } from "@/auth";

export class UnauthorizedError extends Error {}

/** Returns the authenticated user id, or throws UnauthorizedError. */
export async function requireUser(): Promise<string> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new UnauthorizedError("unauthenticated");
  return id;
}
