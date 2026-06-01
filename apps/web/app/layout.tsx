import type { ReactNode } from "react";
import { Anton, Sora } from "next/font/google";
import "./globals.css";

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
    <html lang="en">
      <body className={`${anton.variable} ${sora.variable}`}>{children}</body>
    </html>
  );
}
