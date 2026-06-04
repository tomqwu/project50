import type { ReactElement } from "react";

interface Brand {
  background: string;
  accent: string;
  text: string;
}

/**
 * Branded wordmark shown top-left on every card.
 */
function Wordmark(brand: Brand): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        top: "48px",
        left: "72px",
        fontSize: "26px",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: brand.accent,
        fontWeight: 800,
      }}
    >
      project50
    </div>
  );
}

/**
 * Pure JSX for the default (unbranded-recap) share card. Kept separate from the
 * route so it can be unit-tested without invoking next/og.
 */
export function defaultOgElement(brand: Brand): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: brand.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "96px",
        fontFamily: "sans-serif",
      }}
    >
      {Wordmark(brand)}
      <div
        style={{
          fontSize: "84px",
          fontWeight: 900,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          color: brand.accent,
          textAlign: "center",
          lineHeight: 1.05,
        }}
      >
        project50
      </div>
      <div
        style={{
          fontSize: "40px",
          color: brand.text,
          marginTop: "28px",
          textAlign: "center",
          opacity: 0.92,
        }}
      >
        7 rules · 50 days · no days off
      </div>
    </div>
  );
}

/**
 * Pure JSX for a per-recap share card: big headline (e.g. "Day 25 of 50" or
 * "Day 50 complete"), the challenge title, and a progress stat line.
 */
export function recapOgElement(
  brand: Brand,
  model: { headline: string; subline: string; statText: string },
): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: brand.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      {Wordmark(brand)}
      <div
        style={{
          fontSize: "76px",
          fontWeight: 900,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: brand.accent,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {model.headline}
      </div>
      <div
        style={{
          fontSize: "34px",
          color: brand.text,
          marginTop: "24px",
          textAlign: "center",
          opacity: 0.9,
        }}
      >
        {model.subline}
      </div>
      <div
        style={{
          fontSize: "26px",
          color: "#9aa0a6",
          marginTop: "16px",
          textAlign: "center",
        }}
      >
        {model.statText}
      </div>
    </div>
  );
}
