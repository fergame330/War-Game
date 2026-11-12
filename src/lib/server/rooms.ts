import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  Game,
  ONLINE_MODES,
  redactState,
  type Action,
  type ActionResult,
  type GameState,
  type OnlineModeKey,
} from "@/lib/game/engine";
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
    players: room.players.map((p) => ({
      userId: p.userId,
      username: p.user.username,
      seat: p.seat,
      online: now - p.lastSeenAt.getTime() <= OFFLINE_AFTER_MS,
      lastSeenAt: p.lastSeenAt.getTime(),
      isHost: p.userId === room.hostId,
    })),
    state: state ? redactState(state, mySeat) : null,
    mySeat,
    myUserId: userId,
    serverNow: now,
  };
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
  const expired = room.players.filter(
    (p) => p.seat !== null && state.players[p.seat]?.alive && now - p.lastSeenAt.getTime() > deadline
  );
  if (!expired.length) return;
  await mutateGame(code, (game, fresh) => {
    let changed = false;
    for (const p of fresh.players) {
      if (p.seat === null || !game.s.players[p.seat]?.alive) continue;
      if (Date.now() - p.lastSeenAt.getTime() > deadline && game.stage !== "over") {
        changed = game.dissolve(p.seat) || changed;
      }
    }
    return { result: null, changed };
  });
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
