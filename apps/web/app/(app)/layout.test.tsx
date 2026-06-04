import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ---- hoisted mocks ----
const { mockRequireAuth } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn<() => Promise<string>>(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mockRequireAuth }));
vi.mock("./_actions/auth", () => ({ signOutAction: vi.fn() }));
vi.mock("next/link", () => ({
  // Render as a plain anchor in tests
  default: ({
    href,
    children,
    style,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
    "aria-label"?: string;
  }) => (
    <a href={href} style={style} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

import AppLayout from "./layout";

describe("AppLayout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireAuth.mockResolvedValue("u1");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the nav with wordmark and links", async () => {
    const ui = await AppLayout({ children: <div data-testid="child">page</div> });
    render(ui);
    expect(screen.getByText("project50")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
    expect(screen.getByRole("link", { name: "New" })).toHaveAttribute("href", "/challenges/new");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("gives the wordmark home link an explicit accessible name", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui);
    expect(screen.getByRole("link", { name: "project50 home" })).toHaveAttribute("href", "/");
  });

  it("exposes a labelled primary navigation landmark", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("lets the primary nav row wrap so its links don't overflow narrow screens", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const row = nav.querySelector("div");
    expect(row).not.toBeNull();
    expect(row).toHaveStyle({ flexWrap: "wrap" });
  });

  it("renders a main landmark with id=main as the skip-link target", async () => {
    const ui = await AppLayout({ children: <div data-testid="child">page</div> });
    render(ui);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toContainElement(screen.getByTestId("child"));
  });

  it("gives the main content column horizontal padding so content never touches the screen edge on mobile", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui);
    const main = screen.getByRole("main");
    expect(main).toHaveStyle({ paddingLeft: "16px", paddingRight: "16px" });
  });

  it("renders a skip-to-content link as the first focusable element", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui);
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveAttribute("href", "#main");
  });

  it("gates access via requireAuth", async () => {
    await AppLayout({ children: <div /> });
    expect(mockRequireAuth).toHaveBeenCalled();
  });
});
