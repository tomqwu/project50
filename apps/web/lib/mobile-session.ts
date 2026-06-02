import { encode, decode } from "next-auth/jwt";

/**
 * Salt for JWT encode/decode. Must equal the session cookie name so that
 * dev/e2e tokens (extracted from the cookie and sent as a Bearer) decode with
 * the same salt as tokens we mint here. Auth.js v5 default over http is
 * "authjs.session-token".
 */
export const SESSION_SALT = "authjs.session-token";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

/** Mint a NextAuth-compatible session JWT carrying the user id. */
export async function mintSessionToken(uid: string): Promise<string> {
  return encode({
    token: { uid },
    secret: secret(),
    salt: SESSION_SALT,
    maxAge: THIRTY_DAYS_SECONDS,
  });
}

/** Decode an `Authorization: Bearer <jwt>` header into a uid, or null. */
export async function readBearerUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const [scheme, raw] = authHeader.split(" ");
  if (scheme !== "Bearer" || !raw) return null;
  try {
    const payload = await decode({ token: raw, secret: secret(), salt: SESSION_SALT });
    const uid = (payload as { uid?: string } | null)?.uid;
    return uid ?? null;
  } catch {
    return null;
  }
}
