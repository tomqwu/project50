import type { ReactNode } from "react";
import { Anton, Sora } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./_components/ServiceWorkerRegister";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} dir={localeDirection(DEFAULT_LOCALE)}>
      <body className={`${anton.variable} ${sora.variable}`}>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
