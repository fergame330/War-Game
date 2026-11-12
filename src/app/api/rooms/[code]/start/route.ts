import { Prisma } from "@/generated/prisma/client";
import { Game, ONLINE_MODES, type OnlineModeKey } from "@/lib/game/engine";
import { db } from "@/lib/server/db";
import { buildPayload, errorResponse, HttpError, loadRoom, requireUser } from "@/lib/server/rooms";

/** O dono da sala inicia a partida quando todas as vagas estão preenchidas. */
export async function POST(_request: Request, ctx: RouteContext<"/api/rooms/[code]/start">) {
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const room = await loadRoom(code);
    if (room.hostId !== user.id) throw new HttpError(403, "Só quem criou a sala pode iniciar.");
    if (room.status !== "LOBBY") throw new HttpError(409, "A partida já começou.");
    const mode = ONLINE_MODES[room.mode as OnlineModeKey];
    if (room.players.length !== mode.players) {
      throw new HttpError(409, `São necessários ${mode.players} jogadores (há ${room.players.length}).`);
    }
    // cores, ordem, equipes e territórios são sorteados pelo motor
    const game = Game.create(mode.players, {
      mode: mode.mode,
      names: room.players.map((p) => p.user.username),
      userIds: room.players.map((p) => p.userId),
    });
    const state = game.toState();
    const seatOf = new Map(state.players.map((p) => [p.userId!, p.index]));
    const now = new Date();
    await db().$transaction([
      ...room.players.map((p) =>
        db().roomPlayer.update({ where: { id: p.id }, data: { seat: seatOf.get(p.userId)!, lastSeenAt: now } })
      ),
      db().room.updateMany({
        where: { id: room.id, version: room.version, status: "LOBBY" },
        data: { status: "PLAYING", state: state as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
      }),
    ]);
    return Response.json(buildPayload(await loadRoom(code), user.id));
  } catch (err) {
    return errorResponse(err);
  }
}
