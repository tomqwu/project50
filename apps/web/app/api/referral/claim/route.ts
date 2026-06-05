import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { handleRoute, unprocessable } from "@/lib/api/http";
import { recordReferral } from "@/lib/api/referral";
import { REFERRAL_COOKIE } from "@/lib/referral-capture";

/**
 * POST /api/referral/claim — records that the signed-in (newly-signed-up) user
 * was referred. The referral code is taken from the JSON body `{ code }` when
 * present, otherwise from the `p50_ref` cookie that `middleware` captured from a
 * `/?ref=<code>` invite link BEFORE the sign-in / OAuth redirect (the cookie is
 * the path that survives a signed-out invitee's auth round-trip — a query param
 * does not).
 *
 * On any handled attempt the `p50_ref` cookie is cleared so a stale code can't
 * re-attribute later. Idempotent and self-referral-safe via `recordReferral`:
 * `{ recorded: false }` means a harmless no-op (unknown code, self-referral, or
 * already referred). 422 only when there is no code at all (neither body nor
 * cookie).
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

    const recorded = await recordReferral(code, uid);

    const res = NextResponse.json({ recorded });
    // Always clear the pending-referral cookie once we've handled it, so a stale
    // code can't be re-claimed on a later request.
    res.cookies.set(REFERRAL_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  });
}
