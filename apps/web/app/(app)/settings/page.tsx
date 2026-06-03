import { requireUser } from "@/lib/session";
import { getAccount } from "@/lib/api/account";
import { AccountSettingsForm } from "./_components/AccountSettingsForm";
import { DeleteAccountSection } from "./_components/DeleteAccountSection";

export default async function SettingsPage() {
  const uid = await requireUser();
  const account = await getAccount(uid);
  return (
    <>
      <AccountSettingsForm initial={account} />
      <DeleteAccountSection handle={account.handle} />
    </>
  );
}
