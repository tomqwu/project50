import type { ReactNode } from "react";
import { Anton, Sora } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./_components/ServiceWorkerRegister";
import { CookieConsent } from "./_components/CookieConsent";
import { AnalyticsProvider } from "./_components/AnalyticsProvider";
import { DEFAULT_LOCALE, localeDirection } from "@/lib/i18n";
import type { Metadata } from "next";
import { OG_DEFAULT_ALT, OG_SIZE, resolveSiteUrl } from "@/lib/og/meta";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--next-font-display",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--next-font-body",
  display: "swap",
});

const SITE_TITLE = "project50";
const SITE_DESCRIPTION = "50-day challenges";

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/opengraph-image",
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        alt: OG_DEFAULT_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/twitter-image"],
  },
};

// Render at device width on mobile (not a zoomed-out desktop width) so the
// responsive app-shell padding and fluid widths actually apply on phones.
export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} dir={localeDirection(DEFAULT_LOCALE)}>
      <body className={`${anton.variable} ${sora.variable}`}>
        <ServiceWorkerRegister />
        <AnalyticsProvider />
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
