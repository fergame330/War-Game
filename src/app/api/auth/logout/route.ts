import { destroySession } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/rooms";

export async function POST() {
  try {
    await destroySession();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
