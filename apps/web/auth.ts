import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@project50/db";
import { onJwt, onSession, onSignIn } from "@/lib/auth-callbacks";

const providers: NextAuthConfig["providers"] = [
  Google({ allowDangerousEmailAccountLinking: true }),
  Facebook({ allowDangerousEmailAccountLinking: true }),
];

// Test-only deterministic sign-in. NEVER enabled in production.
if (process.env.AUTH_E2E === "1") {
  providers.push(
    Credentials({
      id: "e2e",
      name: "E2E",
      credentials: { handle: {} },
      authorize: async (creds) => {
        const handle = String(creds?.handle ?? "e2e-user");
        const user = await prisma.user.upsert({
          where: { handle },
          update: {},
          create: { handle, displayName: handle },
        });
        return { id: user.id, name: user.displayName };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    jwt: onJwt,
    session: onSession,
    signIn: onSignIn,
  },
});
