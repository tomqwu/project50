// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

const ENV = { ...process.env };

beforeEach(() => {
  delete process.env.CRON_SECRET;
});
afterEach(() => {
  process.env = { ...ENV };
});

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/whatever", { method: "POST", headers });
}

describe("isAuthorizedCron", () => {
  it("returns false when CRON_SECRET is unset (route stays locked)", () => {
    expect(isAuthorizedCron(req({ authorization: "Bearer anything" }))).toBe(false);
  });

  it("returns false when CRON_SECRET is set to an empty string", () => {
    process.env.CRON_SECRET = "";
    expect(isAuthorizedCron(req({ authorization: "Bearer " }))).toBe(false);
  });

  it("returns false when the Authorization header is missing", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(isAuthorizedCron(req())).toBe(false);
  });

  it("returns false when the token is wrong but the same length", () => {
    process.env.CRON_SECRET = "s3cr3t"; // 6 chars
    expect(isAuthorizedCron(req({ authorization: "Bearer wrong6" }))).toBe(false); // also 6
  });

  it("returns false when the token is wrong with a different length", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(isAuthorizedCron(req({ authorization: "Bearer waytoolong-and-different" }))).toBe(false);
  });

  it("returns false when the scheme is not Bearer", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(isAuthorizedCron(req({ authorization: "Basic s3cr3t" }))).toBe(false);
  });

  it("returns true when the Bearer token matches the secret exactly", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(isAuthorizedCron(req({ authorization: "Bearer s3cr3t" }))).toBe(true);
  });
});
