import type { ReactNode } from "react";

export const metadata = { title: "project50", description: "50-day challenges" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "#121013", color: "#F2F0EC", margin: 0 }}>{children}</body>
    </html>
  );
}
