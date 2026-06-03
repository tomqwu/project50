import { Spinner } from "../../_components/Spinner";

/**
 * Route-level loading UI for the feed.
 * Shown by Next.js while the feed segment's data is streaming.
 */
export default function FeedLoading() {
  return <Spinner />;
}
