import { handleRoute } from "@/lib/api/http";
import { getCapabilities } from "@/lib/publish/registry";

export async function GET() {
  return handleRoute(async () => {
    const capabilities = getCapabilities();
    return Response.json(capabilities);
  });
}
