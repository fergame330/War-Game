import type { Action } from "@/lib/game/engine";
import { applyAction, buildPayload, errorResponse, HttpError, readJson, requireUser, touchPresence } from "@/lib/server/rooms";

const ACTION_TYPES = new Set<Action["type"]>([
  "place", "attack", "occupy", "endAttack", "move", "endMove", "trade", "skipTrade",
  "vassal", "unvassal", "sendCard", "surrenderVote",
]);

/** Executa uma ação do jogador. O motor do jogo valida tudo no servidor. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/action">) {
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const { action } = await readJson<{ action?: Action }>(request);
    if (!action || typeof action !== "object" || !ACTION_TYPES.has(action.type)) {
      throw new HttpError(400, "Ação inválida.");
    }
    const { result, room } = await applyAction(code, user.id, action);
    await touchPresence(room.id, user.id);
    return Response.json({ result, room: buildPayload(room, user.id) }, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return errorResponse(err);
  }
}
