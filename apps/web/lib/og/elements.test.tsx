import { describe, expect, it } from "vitest";
import { defaultOgElement, recapOgElement } from "./elements";

const brand = { background: "#121013", accent: "#D6FF3F", text: "#ffffff" };

describe("defaultOgElement", () => {
  it("renders the wordmark, headline, and tagline on the brand background", () => {
    const tree = JSON.stringify(defaultOgElement(brand));
    expect(tree).toContain("project50");
    expect(tree).toContain("7 rules · 50 days · no days off");
    expect(tree).toContain("#121013");
    expect(tree).toContain("#D6FF3F");
  });

  it("returns a single root element", () => {
    const el = defaultOgElement(brand);
    expect(el.type).toBe("div");
  });
});

describe("recapOgElement", () => {
  it("renders the model headline, subline, and stat text", () => {
    const tree = JSON.stringify(
      recapOgElement(brand, {
        headline: "Day 25 of 50",
        subline: "Run 5K",
        statText: "24 days · 120 km",
      }),
    );
    expect(tree).toContain("Day 25 of 50");
    expect(tree).toContain("Run 5K");
    expect(tree).toContain("24 days · 120 km");
    // wordmark still present
    expect(tree).toContain("project50");
  });

  it("returns a single root element", () => {
    const el = recapOgElement(brand, {
      headline: "h",
      subline: "s",
      statText: "t",
    });
    expect(el.type).toBe("div");
  });
});
