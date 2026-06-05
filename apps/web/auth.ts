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
  shouldRegisterE2eProvider,
  shouldUseSecureCookies,
} from "@/lib/auth-config";
import { isEmailConfigured } from "@/lib/email";
import { verifyMagicLink } from "@/lib/api/magic-link";

// Read the documented env names (GOOGLE_CLIENT_ID / FACEBOOK_CLIENT_ID, etc.).
// Without explicit values, Auth.js v5 would look for AUTH_GOOGLE_ID / AUTH_FACEBOOK_ID
// instead, so the keys in .env(.example) would be ignored.
//
// Both OAuth providers are ENV-GATED — exactly like the e2e and magic-link
// providers below — so a provider only registers when its client id is set.
// Production currently leaves GOOGLE_CLIENT_ID unset (Google OAuth not yet
// configured) → no Google provider is offered; FACEBOOK_CLIENT_ID is set →
// Facebook stays. In e2e the Playwright webServer sets both, so both register.
const providers: NextAuthConfig["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (process.env.FACEBOOK_CLIENT_ID) {
  providers.push(
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    }),
  );
}

// Test-only deterministic sign-in. NEVER enabled in production.
// The whole production-safety decision lives in shouldRegisterE2eProvider
// (apps/web/lib/auth-config.ts, #277): it requires AUTH_E2E === "1" (gate 1),
// allows it freely outside production, and in production registers the provider
// ONLY for the single documented escape hatch AUTH_E2E_ALLOW_PROD === "1" (the
// CI e2e prod-build server) — refusing silently when the flag is absent and
// THROWING a startup error if AUTH_E2E_ALLOW_PROD is set to anything else, so a
// misconfiguration can never quietly expose the passwordless test login.
if (shouldRegisterE2eProvider()) {
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
