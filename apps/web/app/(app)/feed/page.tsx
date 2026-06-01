import { requireUser } from "@/lib/session";
import { feed } from "@/lib/api/social";
import { FeedView } from "./_components/FeedView";
import type { FeedActivity } from "./_components/FeedView";

export default async function FeedPage() {
  const uid = await requireUser();
  const activities = await feed(uid);

  const items: FeedActivity[] = activities.map((a) => ({
    id: a.id,
    userHandle: `@${(a.user as { handle: string }).handle}`,
    challengeTitle: (a.challenge as { title: string }).title,
    dayKey: a.dayKey,
    note: a.note ?? null,
    hasPhoto: a.hasPhoto,
    cheerCount: a.cheerCount,
  }));

  return <FeedView items={items} />;
}
