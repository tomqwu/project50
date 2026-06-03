import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { getAccount, updateAccount } from "@/lib/api/account";

export async function GET() {
  return handleRoute(async () => {
    const uid = await requireUser();
    const account = await getAccount(uid);
    return Response.json(account);
  });
}

export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const body = await req.json();
    const account = await updateAccount(uid, body);
    return Response.json(account);
  });
}
