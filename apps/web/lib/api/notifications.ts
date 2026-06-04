/**
 * Channel-agnostic notification dispatch (#120).
 *
 * The reminder/nudge services don't talk to a transport directly anymore — they
 * build a {@link NotificationMessage} for a {@link NotificationRecipient} and
 * hand it to {@link dispatch}, which fans it out over every enabled
 * {@link Channel}. Today the only delivering channel is email (a thin wrapper
 * around lib/email); push is present as a documented, pluggable stub so it can
 * be wired up later without touching the reminder/streak logic.
 *
 * ── Adding the push channel (FOLLOW-UP) ──────────────────────────────────────
 * `pushChannel` is intentionally a no-op until the schema carries per-user push
 * tokens (e.g. Expo / APNs / FCM device tokens) and `NotificationRecipient`
 * gains a `pushTokens` field. To make push live:
 *   1. Resolve the recipient's device tokens in the caller (reminders.ts).
 *   2. Implement `pushChannel.send` to POST to the push provider for each token.
 *   3. Gate it behind PUSH_ENABLED (already honored by getEnabledChannels).
 * Because dispatch is channel-agnostic, no reminder/streak code has to change.
 */
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

/** Identity needed to deliver a notification to one user, across channels. */
export interface NotificationRecipient {
  userId: string;
  displayName: string;
  /** Email address (placeholder until User.email exists — see reminders.ts). */
  address: string;
  isPlaceholder: boolean;
}

/** A rendered notification, transport-neutral (channels pick what they use). */
export interface NotificationMessage {
  subject: string;
  html: string;
  text: string;
}

/** The result of attempting delivery on a single channel. */
export interface ChannelResult {
  sent: boolean;
}

/**
 * A delivery transport. `send` must never throw for an expected failure
 * (provider/network error, missing config) — it returns `{ sent: false }` so a
 * batch dispatch can continue and other channels still get a chance.
 */
export interface Channel {
  readonly name: string;
  send(
    recipient: NotificationRecipient,
    message: NotificationMessage,
  ): Promise<ChannelResult>;
}

/** Email channel: delivers via the configured provider in lib/email. */
export const emailChannel: Channel = {
  name: "email",
  async send(recipient, message) {
    const result = await sendEmail({
      to: recipient.address,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { sent: result.sent };
  },
};

/**
 * Push channel (documented stub). No-op until per-user push tokens exist; see
 * the file header for how to make it live. Always reports `{ sent: false }` so
 * enabling it today never blocks email delivery.
 */
export const pushChannel: Channel = {
  name: "push",
  async send(recipient) {
    logger.info("push channel not yet implemented; skipping", {
      userId: recipient.userId,
    });
    return { sent: false };
  },
};

/**
 * The channels that are currently enabled. Email is always on (it self-gates on
 * provider config). Push joins the list only when PUSH_ENABLED is set, so it can
 * be flipped on per-environment once the provider is ready.
 */
export function getEnabledChannels(): Channel[] {
  const channels: Channel[] = [emailChannel];
  if (process.env.PUSH_ENABLED) channels.push(pushChannel);
  return channels;
}

/**
 * Deliver one message to one recipient across `channels` (defaults to the
 * enabled set). Returns true when at least one channel reports success — that's
 * what callers count as "delivered". Every channel is attempted regardless of
 * earlier failures.
 */
export async function dispatch(
  recipient: NotificationRecipient,
  message: NotificationMessage,
  channels: Channel[] = getEnabledChannels(),
): Promise<boolean> {
  let delivered = false;
  for (const channel of channels) {
    const result = await channel.send(recipient, message);
    if (result.sent) delivered = true;
  }
  return delivered;
}
