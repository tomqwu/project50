import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { requireAdmin, listUsers, listReports } from "@/lib/api/admin";
import { AdminView } from "../_components/AdminView";

/**
 * Admin-only dashboard. Authenticates the caller, then asserts admin rights;
 * a non-admin (or missing) user gets a 404 so the route is indistinguishable
 * from one that doesn't exist. Admins see the user roster and recent reports.
 */
export default async function AdminPage() {
  const uid = await requireUser();

  try {
    await requireAdmin(uid);
  } catch {
    notFound();
  }

  const [users, reports] = await Promise.all([listUsers(), listReports()]);
  return <AdminView users={users} reports={reports} />;
}
