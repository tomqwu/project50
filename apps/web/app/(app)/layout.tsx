import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";

/**
 * Checks whether the current request has an authenticated user.
 * Returns the uid on success; calls redirect("/signin") if not.
 * Extracted for testability.
 */
export async function requireAuth(): Promise<string> {
  const uid = await requireUser().catch(() => null);
  if (!uid) redirect("/signin");
  return uid;
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireAuth();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: "24px",
          padding: "20px 32px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "22px",
            letterSpacing: "0.05em",
            color: "var(--accent)",
            textTransform: "uppercase",
          }}
        >
          project50
        </span>
        <Link
          href="/"
          style={{
            color: "var(--text)",
            textDecoration: "none",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
          }}
        >
          Dashboard
        </Link>
        <Link
          href="/feed"
          style={{
            color: "var(--text)",
            textDecoration: "none",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
          }}
        >
          Feed
        </Link>
      </nav>
      <main>{children}</main>
    </div>
  );
}
