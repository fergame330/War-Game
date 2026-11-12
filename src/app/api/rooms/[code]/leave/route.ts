import { db } from "@/lib/server/db";
import { bumpVersion, errorResponse, HttpError, loadRoom, requireUser } from "@/lib/server/rooms";

/** Sai da sala (só no lobby; durante a partida vale o tempo de reconexão / desistência). */
export async function POST(_request: Request, ctx: RouteContext<"/api/rooms/[code]/leave">) {
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const room = await loadRoom(code);
    if (room.status === "PLAYING") throw new HttpError(409, "Durante a partida, use a desistência.");
    await db().roomPlayer.deleteMany({ where: { roomId: room.id, userId: user.id } });
    const rest = room.players.filter((p) => p.userId !== user.id);
    if (!rest.length) {
      await db().room.delete({ where: { id: room.id } });
    } else {
      if (room.hostId === user.id) await db().room.update({ where: { id: room.id }, data: { hostId: rest[0].userId } });
      await bumpVersion(room.id);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
