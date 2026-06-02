import { Landing } from "./_components/Landing";

export const metadata = { title: "Sign in — project50" };

export default function SignInPage() {
  const e2eEnabled = process.env.AUTH_E2E === "1";

  return <Landing e2eEnabled={e2eEnabled} />;
}
