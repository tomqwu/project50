"use client";

import { useEffect } from "react";
import { ErrorState } from "../_components/ErrorState";

export interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the authenticated app shell.
 * Next.js renders this when a (app) route segment throws during render or
 * data fetching. `reset` re-renders the segment to retry.
 */
export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    // Surface the error for observability; kept minimal and side-effect only.
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      message="We couldn't load this page. Please try again."
      onRetry={reset}
    />
  );
}
