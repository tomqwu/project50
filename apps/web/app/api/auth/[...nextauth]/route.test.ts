import { describe, expect, it, vi } from "vitest";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("@/auth", () => ({
  handlers: { GET: mockGet, POST: mockPost },
}));

import { GET, POST } from "./route";

describe("auth route handler exports", () => {
  it("exports GET handler from next-auth handlers", () => {
    expect(GET).toBe(mockGet);
  });

  it("exports POST handler from next-auth handlers", () => {
    expect(POST).toBe(mockPost);
  });
});
