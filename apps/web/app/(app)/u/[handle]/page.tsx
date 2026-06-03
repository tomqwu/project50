import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/api/profile";
import { requireUser } from "@/lib/session";
import { ProfileView } from "./_components/ProfileView";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const viewerId = await requireUser().catch(() => null);
  const profile = await getPublicProfile(handle, viewerId ?? undefined);

  if (!profile) {
    notFound();
  }

  return (
    <ProfileView
      handle={profile.handle}
      displayName={profile.displayName}
      challenges={profile.challenges}
      userId={profile.id}
      isFollowing={profile.isFollowing}
      isOwnProfile={viewerId === profile.id}
      hasViewer={viewerId !== null}
    />
  );
}
