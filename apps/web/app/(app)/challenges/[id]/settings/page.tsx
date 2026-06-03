import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getChallenge } from "@/lib/api/challenges";
import { ChallengeSettings } from "../ChallengeSettings";

export default async function ChallengeSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const uid = await requireUser();
  const { id } = await params;

  const challenge = await getChallenge(id, uid);

  // Only the owner may edit or delete a challenge.
  if (challenge.ownerId !== uid) notFound();

  return (
    <ChallengeSettings
      id={challenge.id}
      title={challenge.title}
      goalType={challenge.goalType as "TARGET" | "BINARY"}
      unit={challenge.unit}
      dailyTarget={challenge.dailyTarget}
      visibility={challenge.visibility as "PUBLIC" | "FOLLOWERS" | "PRIVATE"}
    />
  );
}
