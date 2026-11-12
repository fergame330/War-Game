import { ONLINE_MODES, type OnlineModeKey } from "@/lib/game/engine";
import { db } from "@/lib/server/db";
import { balancedTeam, buildPayload, bumpVersion, errorResponse, HttpError, loadRoom, requireUser } from "@/lib/server/rooms";

/** Entra na sala pelo código (só enquanto ela está no lobby e tem vaga). */
export async function POST(_request: Request, ctx: RouteContext<"/api/rooms/[code]/join">) {
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const room = await loadRoom(code);
    if (!room.players.some((p) => p.userId === user.id)) {
      if (room.status !== "LOBBY") throw new HttpError(409, "A partida desta sala já começou.");
      const capacity = ONLINE_MODES[room.mode as OnlineModeKey].players;
      if (room.players.length >= capacity) throw new HttpError(409, "A sala está cheia.");
      // com equipes definidas pelo dono, quem entra vai para a equipe com vaga e menos jogadores
      const team = room.randomTeams ? null : balancedTeam(room.mode, room.players.map((p) => p.team));
      await db().roomPlayer.upsert({
        where: { roomId_userId: { roomId: room.id, userId: user.id } },
        create: { roomId: room.id, userId: user.id, team },
        update: { lastSeenAt: new Date() },
      });
      await bumpVersion(room.id);
    }
    return Response.json(buildPayload(await loadRoom(code), user.id));
  } catch (err) {
    return errorResponse(err);
  }
}
