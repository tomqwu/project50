import type { JWT } from "next-auth/jwt";
import type { Account, User, Session } from "next-auth";
import { prisma } from "@project50/db";

/**
 * JWT callback: persists user.id into the token as `uid` on first sign-in.
 * Pure — no side effects.
 */
export function onJwt({ token, user }: { token: JWT; user?: User | null }): JWT {
  if (user?.id) {
    token.uid = user.id;
  }
  return token;
}

/**
 * Session callback: exposes `uid` from the token on the session object.
 * Pure — no side effects.
 */
export function onSession({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Session {
  if (token.uid) {
    (session.user as { id?: string }).id = token.uid as string;
  }
  return session;
}

/**
 * Returns a globally-unique handle derived from `base`, appending an
 * incrementing numeric suffix on collision (alice → alice2 → alice3 …).
 * Deterministic — no Date.now/Math.random — so handles are stable in tests.
 */
async function uniqueHandle(base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  while (await prisma.user.findUnique({ where: { handle: candidate } })) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

/**
 * SignIn callback for OAuth providers.
 *
 * Resolves the account by its GLOBALLY-UNIQUE identity key
 * (provider + providerAccountId) — never by the email-derived handle, which is
 * NOT unique across providers and would otherwise allow account takeover
 * (alice@gmail.com and alice@yahoo.com both derive "alice").
 *
 * - Existing identity → reuse its user, refresh profile.
 * - New identity → create a uniquely-handled user, then the identity.
 *
 * For the e2e and magic-link Credentials providers, returns true immediately
 * (the user was already resolved in authorize()). Unknown providers are refused.
 */
export async function onSignIn({
  user,
  account,
}: {
  user: User;
  account?: Account | null;
}): Promise<boolean> {
  if (!account || account.provider === "e2e" || account.provider === "magic-link") {
    return true;
  }

  const provider =
    account.provider === "google"
      ? "GOOGLE"
      : account.provider === "facebook"
        ? "FACEBOOK"
        : null;
  if (!provider) return false;

  user.id = await resolveOAuthUser({
    provider,
    providerAccountId: account.providerAccountId,
    name: user.name,
    email: user.email,
    image: user.image,
  });
  return true;
}

/**
 * Resolve (or create) the local user for an OAuth identity, returning the uid.
 *
 * Shared by the NextAuth `onSignIn` callback (web) and the mobile code-exchange
 * endpoint. Resolves by the GLOBALLY-UNIQUE `provider + providerAccountId` key
 * (never the email-derived handle, which is not unique across providers and
 * would allow account takeover).
 */
export async function resolveOAuthUser(params: {
  provider: "GOOGLE" | "FACEBOOK";
  providerAccountId: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}): Promise<string> {
  const { provider, providerAccountId, name, email, image } = params;

  const existing = await prisma.identity.findUnique({
    where: {
      provider_providerAccountId: { provider, providerAccountId },
    },
    include: { user: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.user.id },
      data: {
        displayName: name ?? existing.user.displayName,
        avatarUrl: image ?? undefined,
      },
    });
    return existing.user.id;
  }

  const rawHandle = email ?? name ?? providerAccountId;
  const base = (rawHandle.split("@")[0] || providerAccountId).replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );
  const handle = await uniqueHandle(base);

  const dbUser = await prisma.user.create({
    data: {
      handle,
      displayName: name ?? handle,
      avatarUrl: image ?? undefined,
    },
  });

  await prisma.identity.create({
    data: { userId: dbUser.id, provider, providerAccountId },
  });

  return dbUser.id;
}
