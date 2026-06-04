"use client";

import dynamic from "next/dynamic";
import type { SocialShareProps } from "./SocialShareClient";

export type { SocialShareProps } from "./SocialShareClient";

// Lazy-load the social-publishing panel. It sits below the celebrate hero/stats and
// is browser-only (fetch to /publish, navigator.share/clipboard, window.open). Code-
// splitting it with ssr:false keeps it out of the initial JS payload and the server
// render path; the panel hydrates after the page mounts. Implementation unchanged.
const SocialShareClient = dynamic(
  () => import("./SocialShareClient").then((m) => m.SocialShareClient),
  { ssr: false },
);

export function SocialShare(props: SocialShareProps) {
  return <SocialShareClient {...props} />;
}
