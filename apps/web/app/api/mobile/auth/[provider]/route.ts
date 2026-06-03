import { enforceRateLimit, handleRoute, unprocessable } from "@/lib/api/http";
import { resolveOAuthUser } from "@/lib/auth-callbacks";
import { mintSessionToken } from "@/lib/mobile-session";

const GRAPH = "https://graph.facebook.com/v19.0";

/**
 * Mobile OAuth code-exchange endpoint.
 *
 * Lives OUTSIDE `/api/auth/*` so it is not captured by the NextAuth
 * `[...nextauth]` catch-all. Exchanges a Facebook authorization `code` for a
 * profile, resolves/creates the local user, and returns a minted session JWT
 * the mobile client sends back as `Authorization: Bearer`.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  return handleRoute(async () => {
    // Throttle the auth code-exchange to curb credential-stuffing / abuse.
    enforceRateLimit(req, { limit: 10, windowMs: 60_000 });

    const { provider } = await ctx.params;
    if (provider !== "facebook") unprocessable("UNSUPPORTED_PROVIDER");

    const body = await req.json().catch(() => ({}));
    const code: string | undefined = body?.code;
    const redirectUri: string | undefined = body?.redirectUri;
    if (!code || !redirectUri) unprocessable("MISSING_CODE");

    const clientId = process.env.FACEBOOK_CLIENT_ID;
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Facebook OAuth env not configured");
    }

    // 1. Exchange the authorization code for a Facebook access token.
    const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) unprocessable("FB_EXCHANGE_FAILED");
    const { access_token: fbToken } = (await tokenRes.json()) as {
      access_token?: string;
    };
    if (!fbToken) unprocessable("FB_EXCHANGE_FAILED");

    // 2. Fetch the user's profile.
    const meUrl = new URL(`${GRAPH}/me`);
    meUrl.searchParams.set("fields", "id,name,email");
    meUrl.searchParams.set("access_token", fbToken);
    const meRes = await fetch(meUrl);
    if (!meRes.ok) unprocessable("FB_PROFILE_FAILED");
    const profile = (await meRes.json()) as {
      id?: string;
      name?: string;
      email?: string;
    };
    if (!profile.id) unprocessable("FB_PROFILE_FAILED");

    // 3. Resolve the local user, then 4. mint a session token.
    const uid = await resolveOAuthUser({
      provider: "FACEBOOK",
      providerAccountId: profile.id,
      name: profile.name ?? null,
      email: profile.email ?? null,
    });
    const token = await mintSessionToken(uid);
    return Response.json({ token });
  });
}
