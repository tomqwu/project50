import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { exportAccountData } from "@/lib/api/account";

/**
 * GDPR self-serve data export. Returns the signed-in user's complete personal
 * data as a downloadable JSON file. `Content-Disposition: attachment` prompts
 * the browser to save it rather than render it inline.
 */
export async function GET() {
  return handleRoute(async () => {
    const uid = await requireUser();
    const data = await exportAccountData(uid);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="project50-export.json"',
      },
    });
  });
}
