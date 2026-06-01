import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ---- hoisted mocks ----
const { mockRequireAuth } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn<() => Promise<string>>(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mockRequireAuth }));
vi.mock("next/link", () => ({
  // Render as a plain anchor in tests
  default: ({ href, children, style }: { href: string; children: React.ReactNode; style?: React.CSSProperties }) => (
    <a href={href} style={style}>{children}</a>
  ),
}));

import AppLayout from "./layout";

describe("AppLayout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireAuth.mockResolvedValue("u1");
  });

  it("renders the nav with wordmark and links", async () => {
    const ui = await AppLayout({ children: <div data-testid="child">page</div> });
    render(ui);
    expect(screen.getByText("project50")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
    expect(screen.getByRole("link", { name: "New" })).toHaveAttribute("href", "/challenges/new");
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("gates access via requireAuth", async () => {
    await AppLayout({ children: <div /> });
    expect(mockRequireAuth).toHaveBeenCalled();
  });
});
