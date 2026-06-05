import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { handleRoute, unprocessable } from "@/lib/api/http";
import { recordReferral, getUserCreatedAt } from "@/lib/api/referral";
import { REFERRAL_COOKIE, parseReferralCookie } from "@/lib/referral-capture";

/**
 * POST /api/referral/claim — records that the signed-in (newly-signed-up) user
 * was referred. The referral code is taken from the JSON body `{ code }` when
 * present, otherwise from the `p50_ref` cookie that `middleware` captured from a
 * `/?ref=<code>` invite link BEFORE the sign-in / OAuth redirect (the cookie is
 * the path that survives a signed-out invitee's auth round-trip — a query param
 * does not).
 *
 * CAPTURE-VS-SIGNUP GATE (cookie path only): the authenticated layout auto-POSTs
 * this for ANY pending cookie, so a RETURNING user — or someone who signed up
 * organically and only later clicked an invite link — would otherwise be
 * mis-attributed. The cookie stores the CAPTURE time alongside the code, and a
 * cookie claim is recorded ONLY when `capturedAt <= user.createdAt` (the ref was
 * clicked at or before the account existed → genuine referral-driven signup). A
 * cookie with no parseable timestamp (legacy/tampered) fails safe → not
 * recorded. EXPLICIT body-code claims are intentional and stay ungated.
 *
 * On any handled attempt the `p50_ref` cookie is cleared so a stale code can't
 * re-attribute later (a returning user's cookie won't keep retrying). Idempotent
 * and self-referral-safe via `recordReferral`: `{ recorded: false }` means a
 * harmless no-op (unknown code, self-referral, already referred, or a cookie
 * claim that fails the capture-vs-signup gate). 422 only when there is no code
 * at all.
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
    const rawCookie = cookieStore.get(REFERRAL_COOKIE)?.value;
    const parsedCookie = parseReferralCookie(rawCookie);

    // 422 only when there is NOTHING to act on: no body code AND no cookie at
    // all. A cookie that is present but unparseable (legacy/tampered) is a
    // handled no-op below (recorded:false) so it still gets cleared.
    if (bodyCode === null && !rawCookie) {
      unprocessable("INVALID_REFERRAL_CODE");
    }

    let recorded = false;
    if (bodyCode !== null) {
      // Explicit, intentional claim — not gated.
      recorded = await recordReferral(bodyCode, uid);
    } else if (parsedCookie) {
      // Cookie claim: record only if the ref was captured at/before signup.
      const createdAt = await getUserCreatedAt(uid);
      if (createdAt && parsedCookie.capturedAt.getTime() <= createdAt.getTime()) {
        recorded = await recordReferral(parsedCookie.code, uid);
      }
    }
    // else: cookie present but unparseable → fail safe (recorded stays false).

    const res = NextResponse.json({ recorded });
    // Always clear the pending-referral cookie once we've handled it, so a stale
    // code can't be re-claimed on a later request.
    res.cookies.set(REFERRAL_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  });
}
