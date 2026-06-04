/**
 * Email magic-link sign-in (#50).
 *
 * A passwordless flow that rides the existing JWT session machinery WITHOUT a
 * DB-session adapter:
 *
 *   requestMagicLink(email) → mint a single-use, hashed, short-TTL token, store
 *   only its SHA-256 hash, and email a `/auth/magic?token=…` link via lib/email.
 *
 *   verifyMagicLink(token) → look the hash up, ensure it exists / is unexpired /
 *   unused, stamp `usedAt` (single-use), then upsert the User by email and
 *   return its id. The "magic-link" Credentials provider in auth.ts calls this
 *   from its `authorize`, so success establishes a normal JWT session.
 *
 * ENV-GATED: requestMagicLink is a clear no-op when email is not configured
 * (RESEND_API_KEY / EMAIL_FROM unset), mirroring lib/email. The provider itself
 * is only registered when email is configured, so verifyMagicLink is never
 * reached in an OAuth/e2e-only deployment.
 *
 * The raw token is never persisted — only its hash — so a DB leak cannot be
 * replayed into a sign-in.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@project50/db";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const log = logger.child({ scope: "magic-link" });

/** How long a freshly-minted magic link stays valid. */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Bytes of entropy in the raw token (hex-encoded → twice as many chars). */
const TOKEN_BYTES = 32;

/** SHA-256 hex digest of the raw token — what we store and look up by. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Resolve the app's base URL for building the magic link. Prefers AUTH_URL /
 * NEXTAUTH_URL (already used for cookie/secure decisions); falls back to a
 * localhost default so links are still well-formed in dev.
 */
function baseUrl(): string {
  const raw = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Normalize an email for storage/lookup: trim + lowercase. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Outcome of requesting a magic link. */
export type RequestMagicLinkResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "invalid_email" };

/**
 * Mint and email a single-use magic-link for `email`.
 *
 * - Returns `{ sent: false, reason: "not_configured" }` (no token created, no
 *   email) when email is not configured — safe to call unconditionally.
 * - Returns `{ sent: false, reason: "invalid_email" }` for an obviously-invalid
 *   address (no token created).
 * - Otherwise stores the token hash and sends the email; returns `{ sent: true }`
 *   regardless of the underlying provider result so callers don't leak whether
 *   an address exists (enumeration-safe).
 */
export async function requestMagicLink(email: string): Promise<RequestMagicLinkResult> {
  if (!isEmailConfigured()) {
    log.info("magic link requested but email not configured; no-op");
    return { sent: false, reason: "not_configured" };
  }

  const normalized = normalizeEmail(email);
  // Minimal shape check: exactly one @ with non-empty local + domain parts.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    return { sent: false, reason: "invalid_email" };
  }

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  await prisma.magicLinkToken.create({
    data: { email: normalized, tokenHash, expiresAt },
  });

  const link = `${baseUrl()}/auth/magic?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: normalized,
    subject: "Your project50 sign-in link",
    text: `Sign in to project50 by opening this link (valid for 15 minutes):\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Sign in to project50 by clicking the link below (valid for 15 minutes):</p><p><a href="${link}">Sign in to project50</a></p><p>If you didn't request this, you can ignore this email.</p>`,
  });

  return { sent: true };
}

/**
 * Verify a raw magic-link token and resolve the signed-in user.
 *
 * Returns the user's id on success, or `null` when the token is unknown,
 * expired, or already used. On success the token is atomically marked used
 * (single-use) and the User is upserted by email — creating a uniquely-handled
 * account on first sign-in.
 */
export async function verifyMagicLink(token: string): Promise<string | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const record = await prisma.magicLinkToken.findUnique({ where: { tokenHash } });
  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;

  // Mark used FIRST (single-use): guard against a race where two clicks land
  // together. updateMany with the usedAt: null filter is a no-op (count 0) if
  // another request already consumed it.
  const consumed = await prisma.magicLinkToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count === 0) return null;

  const userId = await upsertUserByEmail(record.email);
  return userId;
}

/**
 * Find or create the local User for `email`, returning the uid.
 *
 * Existing email → reuse. New email → create a uniquely-handled user (handle
 * derived from the email local-part) with the email stored.
 */
async function upsertUserByEmail(email: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return existing.id;

  const base = (email.split("@")[0] || "user").replace(/[^a-zA-Z0-9_-]/g, "_");
  const handle = await uniqueHandle(base);
  const created = await prisma.user.create({
    data: { handle, displayName: handle, email },
    select: { id: true },
  });
  return created.id;
}

/**
 * Return a globally-unique handle derived from `base`, appending an incrementing
 * suffix on collision (alice → alice2 → alice3 …). Deterministic — mirrors the
 * helper in lib/auth-callbacks so handles stay stable in tests.
 */
async function uniqueHandle(base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  while (await prisma.user.findUnique({ where: { handle: candidate } })) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}
