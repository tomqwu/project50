import { describe, expect, it } from "vitest";
import { onJwt, onSession } from "./auth-callbacks";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";

describe("onJwt", () => {
  it("sets token.uid when user.id is present", () => {
    const token: JWT = { name: null, email: null, picture: null, sub: undefined };
    const result = onJwt({ token, user: { id: "user-123", name: "Test", email: "test@example.com", image: null } });
    expect(result.uid).toBe("user-123");
  });

  it("passes through token unchanged when user is absent", () => {
    const token: JWT = { name: null, email: null, picture: null, sub: undefined };
    const result = onJwt({ token, user: null });
    expect(result.uid).toBeUndefined();
  });

  it("passes through token unchanged when user has no id", () => {
    const token: JWT = { name: null, email: null, picture: null, sub: undefined };
    const result = onJwt({ token, user: { name: "Test", email: "test@example.com", image: null } });
    expect(result.uid).toBeUndefined();
  });
});

describe("onSession", () => {
  it("sets session.user.id when token.uid is present", () => {
    const session = { user: { name: "Test", email: "test@example.com", image: null }, expires: "2099-01-01" } as Session;
    const token: JWT = { uid: "user-456", name: null, email: null, picture: null, sub: undefined };
    const result = onSession({ session, token });
    expect((result.user as { id?: string }).id).toBe("user-456");
  });

  it("passes through session unchanged when token.uid is absent", () => {
    const session = { user: { name: "Test", email: "test@example.com", image: null }, expires: "2099-01-01" } as Session;
    const token: JWT = { name: null, email: null, picture: null, sub: undefined };
    const result = onSession({ session, token });
    expect((result.user as { id?: string }).id).toBeUndefined();
  });
});
