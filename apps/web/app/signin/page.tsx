import { Landing } from "./_components/Landing";
import { isEmailConfigured } from "@/lib/email";

export const metadata = { title: "Sign in — project50" };

export default function SignInPage() {
  const e2eEnabled = process.env.AUTH_E2E === "1";
  // Offer the email magic-link option only when email is configured (#50).
  const emailEnabled = isEmailConfigured();

  return <Landing e2eEnabled={e2eEnabled} emailEnabled={emailEnabled} />;
}
