import type { ReactNode } from "react";
import { Anton, Sora } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./_components/ServiceWorkerRegister";
import { CookieConsent } from "./_components/CookieConsent";
import { AnalyticsProvider } from "./_components/AnalyticsProvider";
import { ReleaseBadge } from "./_components/ReleaseBadge";
import { DEFAULT_LOCALE, localeDirection } from "@/lib/i18n";

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

export const metadata = { title: "project50", description: "50-day challenges" };

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
        <ReleaseBadge />
        <CookieConsent />
      </body>
    </html>
  );
}
