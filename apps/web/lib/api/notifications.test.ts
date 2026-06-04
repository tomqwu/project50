// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));

import {
  emailChannel,
  pushChannel,
  getEnabledChannels,
  dispatch,
  type NotificationRecipient,
  type NotificationMessage,
} from "./notifications";

const RECIPIENT: NotificationRecipient = {
  userId: "u1",
  displayName: "Dana",
  address: "dana@example.invalid",
  isPlaceholder: false,
};
const MESSAGE: NotificationMessage = {
  subject: "Hi",
  html: "<p>Hi</p>",
  text: "Hi",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  delete process.env.PUSH_ENABLED;
});
afterEach(() => {
  delete process.env.PUSH_ENABLED;
});

describe("emailChannel", () => {
  it("sends via lib/email to the recipient address and reports success", async () => {
    mockSendEmail.mockResolvedValue({ sent: true, id: "m1" });
    const res = await emailChannel.send(RECIPIENT, MESSAGE);
    expect(res).toEqual({ sent: true });
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: RECIPIENT.address,
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
  });

  it("reports failure when the provider does not send", async () => {
    mockSendEmail.mockResolvedValue({ sent: false, reason: "error" });
    const res = await emailChannel.send(RECIPIENT, MESSAGE);
    expect(res).toEqual({ sent: false });
  });

  it("is named 'email'", () => {
    expect(emailChannel.name).toBe("email");
  });
});

describe("pushChannel (documented stub)", () => {
  it("is named 'push' and is a no-op that reports not-sent", async () => {
    expect(pushChannel.name).toBe("push");
    const res = await pushChannel.send(RECIPIENT, MESSAGE);
    expect(res).toEqual({ sent: false });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("getEnabledChannels", () => {
  it("returns only the email channel by default", () => {
    const channels = getEnabledChannels();
    expect(channels.map((c) => c.name)).toEqual(["email"]);
  });

  it("includes the push channel when PUSH_ENABLED is set", () => {
    process.env.PUSH_ENABLED = "1";
    expect(getEnabledChannels().map((c) => c.name)).toEqual(["email", "push"]);
  });
});

describe("dispatch", () => {
  it("counts the send as delivered when at least one channel succeeds", async () => {
    mockSendEmail.mockResolvedValue({ sent: true });
    const delivered = await dispatch(RECIPIENT, MESSAGE, [emailChannel]);
    expect(delivered).toBe(true);
  });

  it("returns false when every channel fails", async () => {
    mockSendEmail.mockResolvedValue({ sent: false, reason: "error" });
    const delivered = await dispatch(RECIPIENT, MESSAGE, [emailChannel, pushChannel]);
    expect(delivered).toBe(false);
  });

  it("returns true if any channel succeeds even when another fails", async () => {
    mockSendEmail.mockResolvedValue({ sent: true });
    const delivered = await dispatch(RECIPIENT, MESSAGE, [pushChannel, emailChannel]);
    expect(delivered).toBe(true);
  });

  it("defaults to the enabled channels when none are passed", async () => {
    mockSendEmail.mockResolvedValue({ sent: true });
    const delivered = await dispatch(RECIPIENT, MESSAGE);
    expect(delivered).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });
});
