import type { GameState, OnlineModeKey } from "@/lib/game/engine";

/** Após este tempo sem sinal, o jogador é considerado desconectado. */
export const OFFLINE_AFTER_MS = 15_000;
/** Tempo para voltar antes da dissolução (contado a partir da desconexão). */
export const RECONNECT_WINDOW_MS = 3 * 60_000;

export type RoomStatus = "LOBBY" | "PLAYING" | "FINISHED";

export interface RoomPlayerView {
  userId: string;
  username: string;
  seat: number | null;
  online: boolean;
  /** Momento (ms, relógio do servidor) do último sinal recebido. */
  lastSeenAt: number;
  isHost: boolean;
  /** Equipe escolhida no lobby (null = sem equipe / sorteio). */
  team: number | null;
}

/** O que cada cliente recebe da sala (as cartas dos outros jogadores vêm ocultas). */
export interface RoomPayload {
  code: string;
  mode: OnlineModeKey;
  status: RoomStatus;
  reconnectTimer: boolean;
  version: number;
  /** Vagas (máximo) e mínimo de jogadores para iniciar. */
  capacity: number;
  minPlayers: number;
  /** Modos de equipe: tamanho e quantidade de equipes; randomTeams = sorteadas ao iniciar. */
  teamSize: number;
  numTeams: number;
  randomTeams: boolean;
  players: RoomPlayerView[];
  state: GameState | null;
  /** Assento do usuário que recebe (null = espectador / ainda no lobby). */
  mySeat: number | null;
  myUserId: string;
  serverNow: number;
}

/** Prazo final (ms) de um jogador desconectado, ou null se está conectado. */
export function dissolveDeadline(p: Pick<RoomPlayerView, "lastSeenAt">, now: number): number | null {
  if (now - p.lastSeenAt <= OFFLINE_AFTER_MS) return null;
  return p.lastSeenAt + OFFLINE_AFTER_MS + RECONNECT_WINDOW_MS;
}
