import Link from "next/link";
import { Button } from "@project50/ui";
import { EmptyState } from "./_components/EmptyState";

/**
 * Global 404 page.
 * Rendered by Next.js for unmatched routes and explicit notFound() calls.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <EmptyState
        title="Page not found"
        message="The page you're looking for doesn't exist or has moved."
        action={
          <Link href="/" style={{ textDecoration: "none" }}>
            <Button variant="primary">Back to home</Button>
          </Link>
        }
      />
    </main>
  );
}
