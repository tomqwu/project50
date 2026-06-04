// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSendDailyReminders } = vi.hoisted(() => ({
  mockSendDailyReminders: vi.fn(),
}));
vi.mock("@/lib/api/reminders", () => ({ sendDailyReminders: mockSendDailyReminders }));

import { POST } from "./route";

const ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  delete process.env.CRON_SECRET;
});
afterEach(() => {
  process.env = { ...ENV };
});

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/reminders", { method: "POST", headers });
}

describe("POST /api/cron/reminders", () => {
  it("returns 503 and never runs the batch when CRON_SECRET is unset", async () => {
    const res = await POST(req({ authorization: "Bearer anything" }));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "not_configured" });
    expect(mockSendDailyReminders).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the Bearer token is missing or wrong", async () => {
    process.env.CRON_SECRET = "s3cr3t";

    const noHeader = await POST(req());
    expect(noHeader.status).toBe(401);

    const wrong = await POST(req({ authorization: "Bearer nope" }));
    expect(wrong.status).toBe(401);

    expect(mockSendDailyReminders).not.toHaveBeenCalled();
  });

  it("runs the batch and returns its summary with a valid secret", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    mockSendDailyReminders.mockResolvedValue({ sent: 3, skipped: 1 });

    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: 3, skipped: 1 });
    expect(mockSendDailyReminders).toHaveBeenCalledOnce();
  });
});
