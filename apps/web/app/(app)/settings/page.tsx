import { requireUser } from "@/lib/session";
import { getAccount } from "@/lib/api/account";
import { AccountSettingsForm } from "./_components/AccountSettingsForm";

export default async function SettingsPage() {
  const uid = await requireUser();
  const account = await getAccount(uid);
  return <AccountSettingsForm initial={account} />;
}
