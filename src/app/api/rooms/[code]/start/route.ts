import { Prisma } from "@/generated/prisma/client";
import { Game, ONLINE_MODES, type OnlineModeKey } from "@/lib/game/engine";
import { db } from "@/lib/server/db";
import { buildPayload, errorResponse, HttpError, loadRoom, playerName, requireUser, seatKey, teamInfo } from "@/lib/server/rooms";
import { TEAM_LETTERS } from "@/lib/game/engine";

/** O dono da sala inicia a partida quando todas as vagas estão preenchidas. */
export async function POST(_request: Request, ctx: RouteContext<"/api/rooms/[code]/start">) {
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const room = await loadRoom(code);
    if (room.hostId !== user.id) throw new HttpError(403, "Só quem criou a sala pode iniciar.");
    if (room.status !== "LOBBY") throw new HttpError(409, "A partida já começou.");
    const mode = ONLINE_MODES[room.mode as OnlineModeKey];
    const count = room.players.length;
    if (count < mode.minPlayers || count > mode.players) {
      throw new HttpError(
        409,
        mode.minPlayers === mode.players
          ? `São necessários ${mode.players} jogadores (há ${count}).`
          : `São necessários de ${mode.minPlayers} a ${mode.players} jogadores (há ${count}).`
      );
    }
    // equipes definidas pelo dono: todas precisam estar completas
    const { teamSize, numTeams } = teamInfo(room.mode);
    const fixedTeams = numTeams > 0 && !room.randomTeams;
    if (fixedTeams) {
      if (room.players.some((p) => p.team === null || p.team < 0 || p.team >= numTeams)) {
        throw new HttpError(409, "Coloque todos os jogadores em uma equipe (ou deixe as equipes aleatórias).");
      }
      for (let t = 0; t < numTeams; t++) {
        const n = room.players.filter((p) => p.team === t).length;
        if (n !== teamSize) throw new HttpError(409, `A Equipe ${TEAM_LETTERS[t]} precisa ter ${teamSize} jogadores (tem ${n}).`);
      }
    }
    // cores, ordem, equipes (se aleatórias) e territórios são sorteados pelo motor
    const game = Game.create(count, {
      mode: mode.mode,
      names: room.players.map(playerName),
      userIds: room.players.map((p) => p.userId ?? undefined),
      bots: room.players.map((p) => !p.userId),
      teams: fixedTeams ? room.players.map((p) => p.team!) : undefined,
    });
    const state = game.toState();
    const seatOf = new Map(state.players.map((p) => [seatKey(p), p.index]));
    const now = new Date();
    await db().$transaction([
      ...room.players.map((p) =>
        db().roomPlayer.update({ where: { id: p.id }, data: { seat: seatOf.get(seatKey(p))!, lastSeenAt: now } })
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
