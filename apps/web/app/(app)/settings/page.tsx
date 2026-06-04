import { requireUser } from "@/lib/session";
import { getAccount } from "@/lib/api/account";
import { getNotificationPrefs } from "@/lib/api/notification-prefs";
import { AccountSettingsForm } from "./_components/AccountSettingsForm";
import { NotificationPrefsSection } from "./_components/NotificationPrefsSection";
import { BillingSection } from "./_components/BillingSection";
import { DeleteAccountSection } from "./_components/DeleteAccountSection";
import { DataExportSection } from "./_components/DataExportSection";

export default async function SettingsPage() {
  const uid = await requireUser();
  const account = await getAccount(uid);
  const notificationPrefs = await getNotificationPrefs(uid);
  return (
    <>
      <AccountSettingsForm initial={account} />
      <NotificationPrefsSection initial={notificationPrefs} />
      <BillingSection />
      <DataExportSection />
      <DeleteAccountSection handle={account.handle} />
    </>
  );
}
