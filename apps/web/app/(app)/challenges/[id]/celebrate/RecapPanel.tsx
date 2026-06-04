"use client";

import dynamic from "next/dynamic";
import type { RecapPanelProps } from "./RecapPanelClient";

export type { RecapItem, RecapPanelProps } from "./RecapPanelClient";

// Lazy-load the recap generator. It lives below the celebrate hero/stats (behind a
// scroll + an explicit "Generate" interaction) and is only meaningful in the
// browser — it calls fetch + navigator.share/clipboard and renders <video>. Pulling
// it out of the initial chunk and disabling SSR keeps it out of the first paint and
// off the server render path. The implementation is unchanged.
const RecapPanelClient = dynamic(
  () => import("./RecapPanelClient").then((m) => m.RecapPanelClient),
  { ssr: false },
);

export function RecapPanel(props: RecapPanelProps) {
  return <RecapPanelClient {...props} />;
}
