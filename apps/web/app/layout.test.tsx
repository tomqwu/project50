import { describe, expect, it, vi } from "vitest";

// Mock next/font/google — it uses Node internals unavailable in jsdom
vi.mock("next/font/google", () => ({
  Anton: () => ({ variable: "--next-font-display", className: "anton" }),
  Sora: () => ({ variable: "--next-font-body", className: "sora" }),
}));

// globals.css import is a no-op in jsdom
vi.mock("./globals.css", () => ({}));

import RootLayout, { metadata } from "./layout";

describe("RootLayout", () => {
  it("exposes page metadata", () => {
    expect(metadata.title).toBe("project50");
  });

  it("wraps children in html/body with font class vars", () => {
    const tree = RootLayout({ children: "content" });
    expect(tree.type).toBe("html");
    const body = tree.props.children;
    expect(body.type).toBe("body");
    // body className should contain the font variable classes
    expect(body.props.className).toContain("--next-font-display");
    expect(body.props.className).toContain("--next-font-body");
    expect(body.props.children).toBe("content");
  });
});
