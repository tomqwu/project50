import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/api/profile";
import { ProfileView } from "./_components/ProfileView";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);

  if (!profile) {
    notFound();
  }

  return (
    <ProfileView
      handle={profile.handle}
      displayName={profile.displayName}
      challenges={profile.challenges}
    />
  );
}
