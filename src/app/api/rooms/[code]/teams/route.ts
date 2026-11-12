import { randomInt } from "node:crypto";
import { TEAM_LETTERS } from "@/lib/game/engine";
import { db } from "@/lib/server/db";
import { buildPayload, errorResponse, HttpError, loadRoom, readJson, requireUser, teamInfo } from "@/lib/server/rooms";

interface TeamsBody {
  /** true = equipes sorteadas ao iniciar; false = o dono define */
  randomTeams?: boolean;
  /** Coloca um jogador numa equipe (null = sem equipe) */
  assign?: { userId: string; team: number | null };
  /** Distribui todos os jogadores aleatoriamente entre as equipes (agora, no lobby) */
  shuffle?: boolean;
}

/** Quem criou a sala escolhe as equipes (ou deixa para o sorteio ao iniciar). */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/teams">) {
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const body = await readJson<TeamsBody>(request);
    const room = await loadRoom(code);
    if (room.hostId !== user.id) throw new HttpError(403, "Só quem criou a sala escolhe as equipes.");
    if (room.status !== "LOBBY") throw new HttpError(409, "A partida já começou.");
    const { teamSize, numTeams } = teamInfo(room.mode);
    if (!numTeams) throw new HttpError(400, "Este modo não tem equipes.");

    const teams = new Map(room.players.map((p) => [p.userId, p.team]));
    const countIn = (t: number) => [...teams.values()].filter((x) => x === t).length;
    let randomTeams = room.randomTeams;

    if (typeof body.randomTeams === "boolean") {
      randomTeams = body.randomTeams;
      if (!randomTeams) {
        // ao passar a escolher, quem ainda está sem equipe vai para a equipe com vaga e menos jogadores
        for (const [userId, team] of teams) {
          if (team !== null && team >= 0 && team < numTeams) continue;
          let best: number | null = null;
          for (let t = 0; t < numTeams; t++) if (countIn(t) < teamSize && (best === null || countIn(t) < countIn(best))) best = t;
          teams.set(userId, best);
        }
      }
    }

    if (body.shuffle) {
      randomTeams = false;
      const ids = [...teams.keys()];
      for (let i = ids.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      ids.forEach((id, i) => teams.set(id, i % numTeams));
    }

    if (body.assign) {
      const { userId, team } = body.assign;
      if (!teams.has(userId)) throw new HttpError(404, "Jogador não está na sala.");
      if (team !== null && (!Number.isInteger(team) || team < 0 || team >= numTeams)) throw new HttpError(400, "Equipe inválida.");
      if (team !== null && teams.get(userId) !== team && countIn(team) >= teamSize) {
        throw new HttpError(409, `A Equipe ${TEAM_LETTERS[team]} já tem ${teamSize} jogadores.`);
      }
      randomTeams = false;
      teams.set(userId, team);
    }

    await db().$transaction([
      db().room.update({ where: { id: room.id }, data: { randomTeams, version: { increment: 1 } } }),
      ...room.players
        .filter((p) => teams.get(p.userId) !== p.team)
        .map((p) => db().roomPlayer.update({ where: { id: p.id }, data: { team: teams.get(p.userId) ?? null } })),
    ]);
    return Response.json(buildPayload(await loadRoom(code), user.id));
  } catch (err) {
    return errorResponse(err);
  }
}
