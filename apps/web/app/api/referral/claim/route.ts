import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { handleRoute, unprocessable } from "@/lib/api/http";
import { recordReferral, isNewlyCreatedUser } from "@/lib/api/referral";
import { REFERRAL_COOKIE } from "@/lib/referral-capture";

/**
 * POST /api/referral/claim — records that the signed-in (newly-signed-up) user
 * was referred. The referral code is taken from the JSON body `{ code }` when
 * present, otherwise from the `p50_ref` cookie that `middleware` captured from a
 * `/?ref=<code>` invite link BEFORE the sign-in / OAuth redirect (the cookie is
 * the path that survives a signed-out invitee's auth round-trip — a query param
 * does not).
 *
 * NEW-USER GATE (cookie path only): the authenticated layout auto-POSTs this for
 * ANY pending cookie, so a RETURNING user who clicks an invite link then signs
 * in would otherwise be mis-attributed as a fresh referral. Cookie-based claims
 * are therefore recorded ONLY when the account was just created (see
 * `isNewlyCreatedUser` — `User.createdAt` within the cookie's TTL). EXPLICIT
 * body-code claims are intentional and stay ungated.
 *
 * On any handled attempt the `p50_ref` cookie is cleared so a stale code can't
 * re-attribute later (a returning user's cookie won't keep retrying). Idempotent
 * and self-referral-safe via `recordReferral`: `{ recorded: false }` means a
 * harmless no-op (unknown code, self-referral, already referred, or — for the
 * cookie path — a non-new user). 422 only when there is no code at all.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();

    const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
    const bodyCode =
      typeof body?.code === "string" && body.code.trim() !== ""
        ? body.code.trim()
        : null;

    const cookieStore = await cookies();
    const cookieCode = cookieStore.get(REFERRAL_COOKIE)?.value?.trim() || null;

    const code = bodyCode ?? cookieCode;
    if (!code) {
      unprocessable("INVALID_REFERRAL_CODE");
    }

    // Cookie-derived claims only count for genuinely-new accounts; explicit body
    // codes are not age-gated.
    const fromCookie = bodyCode === null;
    const eligible = fromCookie ? await isNewlyCreatedUser(uid) : true;
    const recorded = eligible ? await recordReferral(code, uid) : false;

    const res = NextResponse.json({ recorded });
    // Always clear the pending-referral cookie once we've handled it, so a stale
    // code can't be re-claimed on a later request.
    res.cookies.set(REFERRAL_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  });
}
