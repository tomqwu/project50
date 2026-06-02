// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { mintSessionToken, readBearerUser } from "./mobile-session";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

describe("mobile-session", () => {
  it("mints a token that decodes back to the uid", async () => {
    const token = await mintSessionToken("user-123");
    expect(typeof token).toBe("string");
    const uid = await readBearerUser(`Bearer ${token}`);
    expect(uid).toBe("user-123");
  });

  it("returns null for a missing/malformed Authorization header", async () => {
    expect(await readBearerUser(null)).toBeNull();
    expect(await readBearerUser("Basic abc")).toBeNull();
    expect(await readBearerUser("Bearer not-a-jwt")).toBeNull();
  });
});
