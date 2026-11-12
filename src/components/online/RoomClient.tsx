"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ONLINE_MODES, type Action, type ActionResult } from "@/lib/game/engine";
import { api } from "@/lib/online/client";
import type { RoomPayload } from "@/lib/online/types";
import { GameView } from "@/components/game/GameView";
import { Box, Screen } from "@/components/ui/Screen";
import { useToast } from "@/components/ui/Toasts";
import { AuthForm } from "./AuthForm";
import { useMe } from "./useMe";

interface Received {
  room: RoomPayload;
  /** serverNow - Date.now() quando chegou */
  offset: number;
}

export function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const toast = useToast();
  const [me, setMe] = useMe();
  const [data, setData] = useState<Received | null>(null);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [connected, setConnected] = useState(true);

  // aceita só payloads iguais ou mais novos (respostas e eventos podem chegar fora de ordem)
  const accept = useCallback((room: RoomPayload) => {
    const offset = room.serverNow - Date.now();
    setData((prev) => (!prev || room.version >= prev.room.version ? { room, offset } : prev));
  }, []);

  // primeira carga
  useEffect(() => {
    if (!me) return;
    let alive = true;
    api<RoomPayload>(`/api/rooms/${code}`)
      .then((room) => alive && accept(room))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [me, code, accept]);

  // tempo real (Server-Sent Events; o navegador reconecta sozinho)
  const isMember = !!data?.room.players.some((p) => p.userId === data.room.myUserId);
  const shouldStream = !!me && !!data && !deleted && (isMember || data.room.status !== "LOBBY");
  useEffect(() => {
    if (!shouldStream) return;
    const es = new EventSource(`/api/rooms/${code}/events`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as RoomPayload | { deleted: true };
      if ("deleted" in msg) {
        setDeleted(true);
        es.close();
        return;
      }
      setConnected(true);
      accept(msg);
    };
    return () => es.close();
  }, [shouldStream, code, accept]);

  if (me === undefined) return <Loading />;
  if (!me) {
    return (
      <Screen>
        <Box>
          <h2 className="mb-1 text-2xl font-bold">Sala {code}</h2>
          <p className="mb-5 text-muted">Entre ou crie uma conta para participar.</p>
          <AuthForm onDone={setMe} />
        </Box>
      </Screen>
    );
  }
  if (deleted) return <Message title="Sala encerrada" text="Todos saíram desta sala." />;
  if (error) return <Message title={`Sala ${code}`} text={error} />;
  if (!data) return <Loading />;

  const room = data.room;

  const join = async () => {
    try {
      accept(await api<RoomPayload>(`/api/rooms/${code}/join`, { body: {} }));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  if (room.status === "LOBBY") {
    return <Lobby room={room} isMember={isMember} onJoin={join} onUpdate={accept} connected={connected} />;
  }

  if (!room.state) return <Loading />;

  const act = async (action: Action): Promise<ActionResult> => {
    try {
      const res = await api<{ result: ActionResult; room: RoomPayload }>(`/api/rooms/${code}/action`, { body: { action } });
      accept(res.room);
      return res.result;
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
  };

  return (
    <>
      {!connected && (
        <div className="fixed top-0 right-0 left-0 z-[70] bg-danger py-1 text-center text-xs font-bold text-white">Reconectando…</div>
      )}
      <GameView
        key={room.code}
        state={room.state}
        me={room.mySeat ?? -1}
        act={act}
        online={{ code: room.code, players: room.players, reconnectTimer: room.reconnectTimer, serverOffset: data.offset }}
        showOrderOnStart={room.state.round === 1 && room.state.stage.startsWith("setup") && room.state.logs.length < 12}
        exitLabel="Salas"
        onExit={() => router.push("/online")}
      />
    </>
  );
}

function Lobby({
  room,
  isMember,
  onJoin,
  onUpdate,
  connected,
}: {
  room: RoomPayload;
  isMember: boolean;
  onJoin: () => void;
  onUpdate: (r: RoomPayload) => void;
  connected: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mode = ONLINE_MODES[room.mode];
  const amHost = room.players.some((p) => p.isHost && p.userId === room.myUserId);
  const count = room.players.length;
  const full = count >= room.capacity;
  const canStart = count >= room.minPlayers && count <= room.capacity;
  const flexible = room.minPlayers !== room.capacity;

  const start = async () => {
    setBusy(true);
    try {
      onUpdate(await api<RoomPayload>(`/api/rooms/${room.code}/start`, { body: {} }));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await api(`/api/rooms/${room.code}/leave`, { body: {} });
      router.push("/online");
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/sala/${room.code}`);
      toast("Link copiado.");
    } catch {
      toast("Não foi possível copiar.");
    }
  };

  return (
    <Screen>
      <Box>
        <div className="mb-1 text-xs tracking-wider text-muted uppercase">
          Sala {mode.label} · {mode.description}
        </div>
        <div className="font-mono text-5xl font-black tracking-[0.2em] text-accent compact:text-4xl">{room.code}</div>
        <div className="mt-2 flex justify-center gap-2">
          <button className="btn btn-sm btn-ghost" onClick={copyLink}>
            Copiar link
          </button>
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Compartilhe o código. {mode.mode === "solo" ? "As cores e a ordem" : "As equipes, as cores e a ordem"} são sorteadas ao iniciar.
          {room.reconnectTimer ? " Tempo de reconexão: 3 minutos." : " Sem tempo de reconexão."}
        </p>

        <h3 className="mt-5 mb-2 text-left font-bold">
          Jogadores ({count}/{room.capacity})
          {flexible && <span className="ml-2 text-xs font-normal text-muted">mínimo {room.minPlayers} para iniciar</span>}
        </h3>
        <ul className="grid gap-1.5 text-left">
          {room.players.map((p) => (
            <li key={p.userId} className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-2">
              <span className={`size-2.5 rounded-full ${p.online ? "bg-ok" : "bg-danger"}`} title={p.online ? "Conectado" : "Desconectado"} />
              <b>{p.username}</b>
              {p.userId === room.myUserId && <span className="text-xs text-muted">(você)</span>}
              {p.isHost && <span className="ml-auto text-xs text-accent">dono da sala</span>}
            </li>
          ))}
          {flexible ? (
            !full && (
              <li className="rounded-lg border border-dashed border-line px-3 py-2 text-muted">
                {room.capacity - count} vaga(s) livre(s)
              </li>
            )
          ) : (
            Array.from({ length: room.capacity - count }, (_, i) => (
              <li key={`vaga${i}`} className="rounded-lg border border-dashed border-line px-3 py-2 text-muted">
                Vaga livre
              </li>
            ))
          )}
        </ul>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {isMember ? (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={leave}>
                Sair da sala
              </button>
              {amHost ? (
                <button className="btn btn-big" disabled={!canStart || busy} onClick={start}>
                  {canStart
                    ? flexible
                      ? `Iniciar com ${count} jogadores`
                      : "Iniciar partida"
                    : `Aguardando ${room.minPlayers - count}…`}
                </button>
              ) : (
                <span className="self-center text-muted">Aguardando o dono da sala iniciar…</span>
              )}
            </>
          ) : (
            <>
              <Link href="/online" className="btn btn-ghost">
                Voltar
              </Link>
              <button className="btn btn-big" disabled={full} onClick={onJoin}>
                {full ? "Sala cheia" : "Entrar nesta sala"}
              </button>
            </>
          )}
        </div>
        {isMember && !connected && <p className="mt-3 text-xs text-[#ffb4a8]">Reconectando…</p>}
      </Box>
    </Screen>
  );
}

function Loading() {
  return (
    <Screen>
      <p className="text-muted">Carregando…</p>
    </Screen>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <Screen>
      <Box>
        <h2 className="mb-2 text-2xl font-bold">{title}</h2>
        <p className="mb-5 text-muted">{text}</p>
        <Link href="/online" className="btn">
          Voltar às salas
        </Link>
      </Box>
    </Screen>
  );
}
