import { Spinner } from "../_components/Spinner";

/**
 * Route-level loading UI for the authenticated app shell.
 * Shown by Next.js while a (app) route segment's data is streaming.
 */
export default function Loading() {
  return <Spinner />;
}
