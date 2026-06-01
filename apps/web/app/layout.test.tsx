import { describe, expect, it } from "vitest";
import RootLayout, { metadata } from "./layout";

describe("RootLayout", () => {
  it("exposes page metadata", () => {
    expect(metadata.title).toBe("project50");
  });

  it("wraps children in html/body", () => {
    const tree = RootLayout({ children: "content" });
    expect(tree.type).toBe("html");
    const body = tree.props.children;
    expect(body.type).toBe("body");
    expect(body.props.children).toBe("content");
  });
});
