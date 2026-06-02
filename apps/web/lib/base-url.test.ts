import { describe, it, expect, afterEach } from "vitest";
import { getBaseUrl } from "./base-url";

afterEach(() => {
  delete process.env.APP_BASE_URL;
});

describe("getBaseUrl", () => {
  it("returns APP_BASE_URL when set", () => {
    process.env.APP_BASE_URL = "https://project50.app";
    expect(getBaseUrl()).toBe("https://project50.app");
  });

  it("returns http://localhost:3000 when APP_BASE_URL is not set", () => {
    delete process.env.APP_BASE_URL;
    expect(getBaseUrl()).toBe("http://localhost:3000");
  });
});
