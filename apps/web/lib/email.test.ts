// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isEmailConfigured, sendEmail } from "./email";

const ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("isEmailConfigured", () => {
  it("is false when neither key nor from-address is set", () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it("is false when only one of the two vars is set", () => {
    process.env.RESEND_API_KEY = "re_x";
    expect(isEmailConfigured()).toBe(false);
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = "a@b.co";
    expect(isEmailConfigured()).toBe(false);
  });

  it("is true when both are set", () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "a@b.co";
    expect(isEmailConfigured()).toBe(true);
  });
});

describe("sendEmail (not configured)", () => {
  it("is a no-op that returns not_configured and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await sendEmail({ to: "u@x.co", subject: "hi", text: "yo" });
    expect(res).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("sendEmail (configured)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@p50.co";
  });

  it("POSTs to Resend with bearer auth and html body, returning the message id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }),
    );

    const res = await sendEmail({ to: "u@x.co", subject: "Hi", html: "<b>yo</b>" });

    expect(res).toEqual({ sent: true, id: "msg_123" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      from: "noreply@p50.co",
      to: "u@x.co",
      subject: "Hi",
      html: "<b>yo</b>",
    });
  });

  it("includes text (and omits html) when only text is given", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "m" }), { status: 200 }),
    );
    await sendEmail({ to: "u@x.co", subject: "S", text: "plain" });
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string);
    expect(body.text).toBe("plain");
    expect(body.html).toBeUndefined();
  });

  it("returns sent:true with no id when the provider omits one", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const res = await sendEmail({ to: "u@x.co", subject: "S", text: "t" });
    expect(res).toEqual({ sent: true, id: undefined });
  });

  it("returns error and logs when the provider responds non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad request", { status: 422 }),
    );
    const res = await sendEmail({ to: "u@x.co", subject: "S", text: "t" });
    expect(res).toEqual({ sent: false, reason: "error" });
  });

  it("catches a thrown fetch (network error) and returns error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await sendEmail({ to: "u@x.co", subject: "S", text: "t" });
    expect(res).toEqual({ sent: false, reason: "error" });
  });

  it("tolerates a non-JSON success body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );
    const res = await sendEmail({ to: "u@x.co", subject: "S", text: "t" });
    expect(res).toEqual({ sent: true, id: undefined });
  });
});
