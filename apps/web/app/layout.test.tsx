import { describe, expect, it, vi } from "vitest";

// Mock next/font/google — it uses Node internals unavailable in jsdom
vi.mock("next/font/google", () => ({
  Anton: () => ({ variable: "--next-font-display", className: "anton" }),
  Sora: () => ({ variable: "--next-font-body", className: "sora" }),
}));

// globals.css import is a no-op in jsdom
vi.mock("./globals.css", () => ({}));

// Mock ServiceWorkerRegister
vi.mock("./_components/ServiceWorkerRegister", () => ({
  ServiceWorkerRegister: () => null,
}));

import RootLayout, { metadata, viewport } from "./layout";

describe("RootLayout", () => {
  it("exposes page metadata", () => {
    expect(metadata.title).toBe("project50");
  });

  it("sets a mobile-friendly viewport (device-width, initial-scale 1)", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
  });

  it("sets the document language and text direction from the active locale", () => {
    const tree = RootLayout({ children: "content" });
    expect(tree.type).toBe("html");
    expect(tree.props.lang).toBe("en");
    expect(tree.props.dir).toBe("ltr");
  });

  it("wraps children in html/body with font class vars", () => {
    const tree = RootLayout({ children: "content" });
    expect(tree.type).toBe("html");
    const body = tree.props.children;
    expect(body.type).toBe("body");
    // body className should contain the font variable classes
    expect(body.props.className).toContain("--next-font-display");
    expect(body.props.className).toContain("--next-font-body");
    // body children is now [ServiceWorkerRegister, children]
    const bodyChildren = body.props.children;
    expect(bodyChildren).toContain("content");
  });
});
