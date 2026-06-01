import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ---- hoisted mocks ----
const { mockRequireUser, mockRedirect } = vi.hoisted(() => ({
  mockRequireUser: vi.fn<() => Promise<string>>(),
  mockRedirect: vi.fn<(url: string) => never>(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("next/link", () => ({
  // Render as a plain anchor in tests
  default: ({ href, children, style }: { href: string; children: React.ReactNode; style?: React.CSSProperties }) => (
    <a href={href} style={style}>{children}</a>
  ),
}));

import { requireAuth } from "./layout";
import AppLayout from "./layout";

describe("requireAuth", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns uid when user is authenticated", async () => {
    mockRequireUser.mockResolvedValue("u1");
    const uid = await requireAuth();
    expect(uid).toBe("u1");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("calls redirect('/signin') when requireUser throws", async () => {
    mockRequireUser.mockRejectedValue(new Error("unauth"));
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/signin");
  });
});

describe("AppLayout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireUser.mockResolvedValue("u1");
  });

  it("renders the nav with wordmark and links", async () => {
    const ui = await AppLayout({ children: <div data-testid="child">page</div> });
    render(ui);
    expect(screen.getByText("project50")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
