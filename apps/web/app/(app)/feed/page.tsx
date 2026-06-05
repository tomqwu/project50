import { requireUser } from "@/lib/session";
import { feed } from "@/lib/api/social";
import { FeedView } from "./_components/FeedView";
import type { FeedActivity } from "./_components/FeedView";

export default async function FeedPage() {
  const uid = await requireUser();
  // The feed is bounded + cursor-paginated; the first page is rendered here.
  // (Infinite scroll via `nextCursor` is a follow-up; see issue #293.)
  const { items: activities } = await feed(uid);

  const items: FeedActivity[] = activities.map((a) => ({
    id: a.id,
    userHandle: `@${(a.user as { handle: string }).handle}`,
    challengeTitle: (a.challenge as { title: string }).title,
    dayKey: a.dayKey,
    note: a.note ?? null,
    hasPhoto: a.hasPhoto,
    cheerCount: a.cheerCount,
    isProject50: a.isProject50,
    project50Day: a.project50Day,
    media: a.media.map((m) => ({
      objectKey: m.objectKey,
      width: m.width,
      height: m.height,
      url: m.url,
    })),
  }));

  return <FeedView items={items} />;
}
