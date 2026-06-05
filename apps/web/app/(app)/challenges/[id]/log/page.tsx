import { requireUser } from "@/lib/session";
import { getChallenge } from "@/lib/api/challenges";
import { LogActivityForm } from "./LogActivityForm";

export default async function LogActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const challenge = await getChallenge(id, uid);

  return (
    <LogActivityForm
      challengeId={challenge.id}
      goalType={challenge.goalType as "TARGET" | "BINARY"}
      unit={challenge.unit ?? null}
      timezone={challenge.timezone ?? null}
    />
  );
}
