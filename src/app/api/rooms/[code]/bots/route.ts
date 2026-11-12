import { BOT_NAMES } from "@/lib/game/bot";
import { ONLINE_MODES, TEAM_LETTERS, type OnlineModeKey } from "@/lib/game/engine";
import { db } from "@/lib/server/db";
import { balancedTeam, buildPayload, errorResponse, HttpError, loadRoom, readJson, requireUser, teamInfo } from "@/lib/server/rooms";

interface BotsBody {
  /** Adiciona 1 bot (com equipes escolhidas, opcionalmente numa equipe específica). */
  add?: { team?: number | null };
  /** Preenche todas as vagas livres com bots. */
  fill?: boolean;
  /** Tira um bot da sala (id do jogador na sala). */
  remove?: string;
}

/** Quem criou a sala coloca ou tira bots no lobby (jogadores controlados pelo servidor). */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/bots">) {
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const body = await readJson<BotsBody>(request);
    const room = await loadRoom(code);
    if (room.hostId !== user.id) throw new HttpError(403, "Só quem criou a sala coloca bots.");
    if (room.status !== "LOBBY") throw new HttpError(409, "A partida já começou.");

    if (body.remove) {
      const bot = room.players.find((p) => p.id === body.remove && !p.userId);
      if (!bot) throw new HttpError(404, "Bot não encontrado.");
      await db().$transaction([
        db().roomPlayer.delete({ where: { id: bot.id } }),
        db().room.update({ where: { id: room.id }, data: { version: { increment: 1 } } }),
      ]);
      return Response.json(buildPayload(await loadRoom(code), user.id));
    }

    if (!body.add && !body.fill) throw new HttpError(400, "Requisição inválida.");
    const capacity = ONLINE_MODES[room.mode as OnlineModeKey].players;
    const free = capacity - room.players.length;
    if (free <= 0) throw new HttpError(409, "A sala está cheia.");
    const { teamSize, numTeams } = teamInfo(room.mode);
    const chooseTeams = numTeams > 0 && !room.randomTeams;

    const teams = room.players.map((p) => p.team);
    const used = new Set(room.players.map((p) => p.botName).filter(Boolean));
    const nextName = () => {
      const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${used.size + 1}`;
      used.add(name);
      return name;
    };
    const wanted = body.fill ? undefined : body.add?.team;
    if (chooseTeams && wanted !== undefined && wanted !== null) {
      if (!Number.isInteger(wanted) || wanted < 0 || wanted >= numTeams) throw new HttpError(400, "Equipe inválida.");
      if (teams.filter((t) => t === wanted).length >= teamSize) {
        throw new HttpError(409, `A Equipe ${TEAM_LETTERS[wanted]} já tem ${teamSize} jogadores.`);
      }
    }

    const creates = [];
    for (let i = 0; i < (body.fill ? free : 1); i++) {
      // com equipes escolhidas, o bot vai para a equipe pedida ou para a que tem vaga e menos jogadores
      const team = chooseTeams ? (wanted ?? balancedTeam(room.mode, teams)) : null;
      teams.push(team);
      creates.push(db().roomPlayer.create({ data: { roomId: room.id, botName: nextName(), team } }));
    }
    await db().$transaction([...creates, db().room.update({ where: { id: room.id }, data: { version: { increment: 1 } } })]);
    return Response.json(buildPayload(await loadRoom(code), user.id));
  } catch (err) {
    return errorResponse(err);
  }
}
