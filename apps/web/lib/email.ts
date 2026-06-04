/**
 * Transactional email (M? #121).
 *
 * OPT-IN, like the Sentry pattern: email only goes out when the provider is
 * configured via RESEND_API_KEY + EMAIL_FROM. With neither set — the default in
 * dev, CI, and e2e — every send is a logged no-op (no SDK, no network call).
 *
 * Dependency-free on purpose: we POST to Resend's REST API with `fetch` instead
 * of pulling in the `resend` SDK. Swapping providers means changing this file
 * only.
 */
import { logger, serializeError } from "@/lib/logger";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** True when both the API key and the from-address are configured. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Provide at least one of html / text. */
  html?: string;
  text?: string;
}

export type SendEmailResult =
  | { sent: true; id?: string }
  | { sent: false; reason: "not_configured" | "error" };

/**
 * Send one email via Resend's REST API.
 *
 * Returns `{ sent: false, reason: "not_configured" }` (and logs) when the
 * provider env is missing — never throws for that case, so callers can run
 * unconditionally. A provider/network failure is caught and returned as
 * `{ sent: false, reason: "error" }` so a batch send doesn't abort midway.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    logger.info("email not configured; skipping send (no-op)", { to: input.to });
    return { sent: false, reason: "not_configured" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        ...(input.html ? { html: input.html } : {}),
        ...(input.text ? { text: input.text } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error("email send failed", { to: input.to, status: res.status, body });
      return { sent: false, reason: "error" };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    logger.info("email sent", { to: input.to, id: data.id });
    return { sent: true, id: data.id };
  } catch (err) {
    logger.error("email send threw", { to: input.to, ...serializeError(err) });
    return { sent: false, reason: "error" };
  }
}
