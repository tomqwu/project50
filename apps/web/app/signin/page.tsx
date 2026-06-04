import { Landing } from "./_components/Landing";
import { ReleaseBadge } from "../_components/ReleaseBadge";
import { isEmailConfigured } from "@/lib/email";

export const metadata = { title: "Sign in — project50" };

// Render per-request at RUNTIME, never statically at build time.
//
// This page gates the OAuth provider buttons on process.env.GOOGLE_CLIENT_ID /
// FACEBOOK_CLIENT_ID (and AUTH_E2E / email config). In the container/Azure
// deploy those env vars are injected at runtime, NOT during `next build`. If
// this Server Component were statically rendered, the flags would be baked from
// build-time env (all unset) and the buttons would stay hidden even when the
// provider IS configured at runtime — breaking sign-in. Forcing dynamic
// rendering makes the env read happen per-request, keeping the buttons in
// lockstep with auth.ts (whose providers are registered at server start, i.e.
// runtime, when the module is first loaded).
export const dynamic = "force-dynamic";

export default function SignInPage() {
  const e2eEnabled = process.env.AUTH_E2E === "1";
  // Offer the email magic-link option only when email is configured (#50).
  const emailEnabled = isEmailConfigured();
  // Offer each OAuth provider only when its client id is configured — mirrors
  // the env-gating in auth.ts so the button and the provider stay in lockstep.
  // Google OAuth is not yet configured in production (GOOGLE_CLIENT_ID unset)
  // → Google is hidden; FACEBOOK_CLIENT_ID is set → Facebook stays.
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  const facebookEnabled = Boolean(process.env.FACEBOOK_CLIENT_ID);

  return (
    <>
      <Landing
        googleEnabled={googleEnabled}
        facebookEnabled={facebookEnabled}
        e2eEnabled={e2eEnabled}
        emailEnabled={emailEnabled}
      />
      {/* Release/build badge on the public landing (the "top page"): tag · sha ·
          time · feature intro. Lives here rather than the global layout so it
          stays off the authenticated visual-regression baseline screens. */}
      <ReleaseBadge />
    </>
  );
}
