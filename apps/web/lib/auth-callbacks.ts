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
 * SignIn callback: for OAuth providers, upserts our User + Identity and
 * sets user.id to the DB user's id. For the e2e Credentials provider,
 * returns true immediately (user was already created in authorize()).
 */
export async function onSignIn({
  user,
  account,
}: {
  user: User;
  account?: Account | null;
}): Promise<boolean> {
  if (!account || account.provider === "e2e") return true;

  const provider = account.provider === "google" ? "GOOGLE" : "FACEBOOK";
  const rawHandle =
    user.email ??
    user.name ??
    account.providerAccountId;
  const handleBase = (rawHandle.split("@")[0] ?? rawHandle).replace(/[^a-zA-Z0-9_-]/g, "_");

  const dbUser = await prisma.user.upsert({
    where: { handle: handleBase },
    update: {
      displayName: user.name ?? handleBase,
      avatarUrl: user.image ?? undefined,
    },
    create: {
      handle: handleBase,
      displayName: user.name ?? handleBase,
      avatarUrl: user.image ?? undefined,
    },
  });

  await prisma.identity.upsert({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: account.providerAccountId,
      },
    },
    update: {},
    create: {
      userId: dbUser.id,
      provider,
      providerAccountId: account.providerAccountId,
    },
  });

  user.id = dbUser.id;
  return true;
}
