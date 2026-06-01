import { requireUser } from "@/lib/session";
import { CreateChallengeForm } from "./CreateChallengeForm";

export default async function NewChallengePage() {
  await requireUser();
  return <CreateChallengeForm />;
}
