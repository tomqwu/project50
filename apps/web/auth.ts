import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@project50/db";
import { onJwt, onSession, onSignIn } from "@/lib/auth-callbacks";
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  parseAuthSecrets,
  shouldUseSecureCookies,
} from "@/lib/auth-config";
import { isEmailConfigured } from "@/lib/email";
import { verifyMagicLink } from "@/lib/api/magic-link";

// Read the documented env names (GOOGLE_CLIENT_ID / FACEBOOK_CLIENT_ID, etc.).
// Without explicit values, Auth.js v5 would look for AUTH_GOOGLE_ID / AUTH_FACEBOOK_ID
// instead, so the keys in .env(.example) would be ignored.
const providers: NextAuthConfig["providers"] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }),
  Facebook({
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
  }),
];

// Test-only deterministic sign-in. NEVER enabled in production.
// Double-gated:
//   Gate 1 — AUTH_E2E === "1": primary gate. This env var is NEVER set in
//     production deployments; it is only present in local .env and the
//     Playwright webServer env (playwright.config.ts).
//   Gate 2 — NODE_ENV !== "production": belt-and-suspenders so the provider
//     cannot activate even if AUTH_E2E leaks. In vitest (unit tests) NODE_ENV
//     is "test"; in `next dev` it is "development".
//     Note: `next start` forces NODE_ENV=production at webpack build time AND
//     at runtime (router-server.js), which would block the e2e provider.
//     To allow it in the Playwright e2e server while keeping the prod guard
//     in unit tests, the webServer also sets AUTH_E2E_ALLOW_PROD=1, which
//     short-circuits gate 2 for the e2e build and runtime.
//     In real production: AUTH_E2E is never set → gate 1 blocks, gate 2 is moot.
if (
  process.env.AUTH_E2E === "1" &&
  (process.env.NODE_ENV !== "production" || process.env.AUTH_E2E_ALLOW_PROD === "1")
) {
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

// Email magic-link sign-in (#50). ENV-GATED on isEmailConfigured() — exactly
// like the e2e provider is gated — so it only registers when RESEND_API_KEY +
// EMAIL_FROM are set. Absent → the provider is never offered and OAuth/e2e auth
// is completely unchanged. It rides the existing JWT session machinery (no DB
// adapter): authorize() validates the single-use token via verifyMagicLink and
// returns the resolved user, establishing a normal session.
if (isEmailConfigured()) {
  providers.push(
    Credentials({
      id: "magic-link",
      name: "Email magic link",
      credentials: { token: {} },
      authorize: async (creds) => {
        const token = typeof creds?.token === "string" ? creds.token : "";
        const userId = await verifyMagicLink(token);
        if (!userId) return null;
        return { id: userId };
      },
    }),
  );
}

// Force Secure cookies only when the deployment URL is https (undefined → keep
// NextAuth's per-request default, so the http e2e server still works).
const secureCookies = shouldUseSecureCookies();

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  // Comma-separated AUTH_SECRET enables zero-downtime secret rotation.
  secret: parseAuthSecrets(process.env.AUTH_SECRET),
  ...(secureCookies ? { useSecureCookies: true } : {}),
  providers,
  callbacks: {
    jwt: onJwt,
    session: onSession,
    signIn: onSignIn,
  },
});
