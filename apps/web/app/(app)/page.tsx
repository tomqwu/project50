import { requireUser } from "@/lib/session";
import { getProject50State } from "@/lib/project50";
import { Project50Client } from "./_components/Project50Client";

export default async function DashboardPage() {
  const uid = await requireUser();

  // The home dashboard always leads with Project 50: an active/failed run shows
  // its checklist/reset screen; no run shows the start choice (which still links
  // out to a custom plan).
  const p50 = await getProject50State(uid);
  return <Project50Client state={p50} />;
}
