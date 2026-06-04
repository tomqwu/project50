import { MagicSignIn } from "./MagicSignIn";

export const metadata = { title: "Signing in — project50" };

/**
 * /auth/magic?token=… — the landing page for an email magic link (#50).
 *
 * Reads the single-use token from the query (Next 15 passes `searchParams` as a
 * Promise) and hands it to the client component, which completes the sign-in via
 * signIn("magic-link", { token }).
 */
export default async function MagicPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  return <MagicSignIn token={token} />;
}
