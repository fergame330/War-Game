import { connection } from "next/server";
import { buildPayload, errorResponse, loadRoom, requireUser, touchPresence } from "@/lib/server/rooms";

/** Estado atual da sala para o usuário (também conta como sinal de presença). */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  // sempre dinâmico: lê cookies e o banco a cada requisição
  await connection();
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const room = await loadRoom(code);
    if (room.players.some((p) => p.userId === user.id)) await touchPresence(room.id, user.id);
    return Response.json(buildPayload(room, user.id));
  } catch (err) {
    return errorResponse(err);
  }
}
