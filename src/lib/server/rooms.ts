import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  Game,
  MODES,
  ONLINE_MODES,
  redactState,
  type Action,
  type ActionResult,
  type GameState,
  type OnlineModeKey,
} from "@/lib/game/engine";
import { botAction, botDelay, fallbackAction, isBotTurn } from "@/lib/game/bot";
import { OFFLINE_AFTER_MS, RECONNECT_WINDOW_MS, type RoomPayload } from "@/lib/online/types";
import { getSessionUser } from "./auth";
import { db } from "./db";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const roomInclude = {
  players: {
    orderBy: { joinedAt: "asc" },
    include: { user: { select: { id: true, username: true } } },
  },
} satisfies Prisma.RoomInclude;

export type RoomWithPlayers = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

export async function loadRoom(code: string): Promise<RoomWithPlayers> {
  const room = await db().room.findUnique({ where: { code: normalizeCode(code) }, include: roomInclude });
  if (!room) throw new HttpError(404, "Sala não encontrada.");
  return room;
}

export function buildPayload(room: RoomWithPlayers, userId: string, now = Date.now()): RoomPayload {
  const me = room.players.find((p) => p.userId === userId);
  const mySeat = me?.seat ?? null;
  const state = room.state as unknown as GameState | null;
  return {
    code: room.code,
    mode: room.mode as OnlineModeKey,
    status: room.status,
    reconnectTimer: room.reconnectTimer,
    version: room.version,
    capacity: ONLINE_MODES[room.mode as OnlineModeKey]?.players ?? 0,
    minPlayers: ONLINE_MODES[room.mode as OnlineModeKey]?.minPlayers ?? 0,
    ...teamInfo(room.mode),
    randomTeams: room.randomTeams,
    players: room.players.map((p) => ({
      id: p.id,
      userId: p.userId,
      username: playerName(p),
      bot: !p.userId,
      seat: p.seat,
      // bots estão sempre "conectados": quem os joga é o servidor
      online: !p.userId || now - p.lastSeenAt.getTime() <= OFFLINE_AFTER_MS,
      lastSeenAt: p.lastSeenAt.getTime(),
      isHost: !!p.userId && p.userId === room.hostId,
      team: p.team,
    })),
    state: state ? redactState(state, mySeat) : null,
    mySeat,
    myUserId: userId,
    serverNow: now,
  };
}

/** Nome de quem está na sala: o usuário ou o nome do bot. */
export function playerName(p: RoomWithPlayers["players"][number]): string {
  return p.user?.username ?? p.botName ?? "Bot";
}

/** Chave que liga um jogador da sala ao jogador da partida (usuário ou nome do bot). */
export function seatKey(p: { userId?: string | null; botName?: string | null; name?: string }): string {
  return p.userId ? `user:${p.userId}` : `bot:${p.botName ?? p.name}`;
}

/** Tamanho e quantidade de equipes do modo online (1 e 0 no individual). */
export function teamInfo(modeKey: string): { teamSize: number; numTeams: number } {
  const m = ONLINE_MODES[modeKey as OnlineModeKey];
  if (!m) return { teamSize: 1, numTeams: 0 };
  const teamSize = MODES[m.mode].teamSize;
  return teamSize > 1 ? { teamSize, numTeams: m.players / teamSize } : { teamSize: 1, numTeams: 0 };
}

/** Equipe com vaga e menos jogadores (para quem entra numa sala com equipes definidas). */
export function balancedTeam(modeKey: string, teams: (number | null)[]): number | null {
  const { teamSize, numTeams } = teamInfo(modeKey);
  let best: number | null = null;
  let bestCount = Infinity;
  for (let t = 0; t < numTeams; t++) {
    const count = teams.filter((x) => x === t).length;
    if (count < teamSize && count < bestCount) {
      best = t;
      bestCount = count;
    }
  }
  return best;
}

/** Marca que o usuário está conectado à sala. */
export async function touchPresence(roomId: string, userId: string): Promise<void> {
  await db().roomPlayer.updateMany({ where: { roomId, userId }, data: { lastSeenAt: new Date() } });
}

/** Incrementa a versão para que todos os clientes recebam a sala de novo (ex.: lobby mudou). */
export async function bumpVersion(roomId: string): Promise<void> {
  await db().room.update({ where: { id: roomId }, data: { version: { increment: 1 } } });
}

/**
 * Altera o estado da partida com concorrência otimista: só grava se a versão não mudou
 * desde a leitura; se mudou, lê de novo e tenta outra vez.
 */
export async function mutateGame<T>(
  code: string,
  fn: (game: Game, room: RoomWithPlayers) => { result: T; changed: boolean }
): Promise<{ result: T; room: RoomWithPlayers }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await loadRoom(code);
    if (!room.state) throw new HttpError(409, "A partida ainda não começou.");
    const game = Game.load(structuredClone(room.state as unknown as GameState));
    const { result, changed } = fn(game, room);
    if (!changed) return { result, room };
    const finished = game.stage === "over";
    const updated = await db().room.updateMany({
      where: { id: room.id, version: room.version },
      data: {
        state: game.toState() as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedAt: new Date(), // usado para o ritmo dos bots
        ...(finished ? { status: "FINISHED" as const } : {}),
      },
    });
    if (updated.count === 1) return { result, room: await loadRoom(code) };
  }
  throw new HttpError(409, "A sala está muito movimentada; tente de novo.");
}

/** Aplica a ação de um jogador (validada pelo motor do jogo). */
export async function applyAction(code: string, userId: string, action: Action): Promise<{ result: ActionResult; room: RoomWithPlayers }> {
  return mutateGame(code, (game, room) => {
    const me = room.players.find((p) => p.userId === userId);
    if (!me || me.seat === null) throw new HttpError(403, "Você não está jogando nesta sala.");
    if (room.status !== "PLAYING") throw new HttpError(409, "A partida não está em andamento.");
    const result = game.apply(action, me.seat);
    return { result, changed: result.ok };
  });
}

/**
 * Verificações periódicas: dissolve quem passou do prazo de reconexão.
 * Roda a partir das conexões em tempo real dos outros jogadores (não precisa de cron).
 */
export async function tick(code: string): Promise<void> {
  const room = await loadRoom(code);
  if (room.status !== "PLAYING" || !room.reconnectTimer || !room.state) return;
  const now = Date.now();
  const deadline = OFFLINE_AFTER_MS + RECONNECT_WINDOW_MS;
  const state = room.state as unknown as GameState;
  // bots nunca se desconectam
  const expired = room.players.filter(
    (p) => p.userId && p.seat !== null && state.players[p.seat]?.alive && now - p.lastSeenAt.getTime() > deadline
  );
  if (!expired.length) return;
  await mutateGame(code, (game, fresh) => {
    let changed = false;
    for (const p of fresh.players) {
      if (!p.userId || p.seat === null || !game.s.players[p.seat]?.alive) continue;
      if (Date.now() - p.lastSeenAt.getTime() > deadline && game.stage !== "over") {
        changed = game.dissolve(p.seat) || changed;
      }
    }
    return { result: null, changed };
  });
}

/** A sala está em jogo e é a vez de um bot? */
export function isBotRoom(room: RoomWithPlayers): boolean {
  if (room.status !== "PLAYING" || !room.state) return false;
  return isBotTurn(Game.load(room.state as unknown as GameState));
}

/**
 * Faz o bot da vez jogar UMA ação, se já passou a pausa desde a última mudança da sala (para que
 * todos acompanhem as jogadas). Roda a partir das conexões em tempo real dos jogadores; a
 * concorrência otimista garante que só uma delas aplica cada jogada.
 */
export async function runBots(code: string): Promise<boolean> {
  const { result } = await mutateGame(code, (game, room) => {
    if (room.status !== "PLAYING" || !isBotTurn(game)) return { result: false, changed: false };
    const action = botAction(game);
    const humansAlive = game.s.players.some((p) => p.alive && !p.bot);
    const delay = humansAlive ? botDelay(action) : 150;
    if (Date.now() - room.updatedAt.getTime() < delay) return { result: false, changed: false };
    const me = game.current;
    let r = game.apply(action, me);
    if (!r.ok) r = game.apply(fallbackAction(game), me);
    return { result: r.ok, changed: r.ok };
  });
  return result;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: "Erro interno." }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Requisição inválida.");
  }
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Faça login para continuar.");
  return user;
}
